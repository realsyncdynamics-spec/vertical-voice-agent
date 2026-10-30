/**
 * vva-sip-webhook – Steuerebene für VVA-Telefonie (Grok Voice über xAI SIP).
 * Ton: Telnyx -> sip.voice.x.ai (direkt, nicht über diesen Worker).
 * Steuerung: xAI -> POST /xai/sip-webhook (realtime.call.incoming, Standard-Webhooks-Signatur)
 *   -> Idempotenz (webhook-id + call_id) -> Zulassung in D1 (fail-closed, Budget, Parallelität)
 *   -> Durable Object CallSession (eine pro call_id) hält wss://api.x.ai/v1/realtime?call_id=…
 *   -> Function Calls -> core.runTool -> D1-Protokoll; refer/hangup über REST.
 * Tool-Calls und Session-Events kommen NUR über diese WebSocket-Verbindung, nicht per Webhook.
 * Secrets (wrangler secret put, test/prod getrennt): XAI_API_KEY, XAI_WEBHOOK_SECRET.
 */
import { admit, runTool, handoffResult, endCall, transcript, logAction, guard, purge } from "./core.js";
const xai = (env) => env.XAI_BASE || "https://api.x.ai";

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    if (req.method === "GET" && url.pathname === "/health") {
      return json({ ok: true, service: "vva-sip-webhook", telephony_enabled: env.TELEPHONY_ENABLED === "true", secrets_configured: Boolean(env.XAI_API_KEY && env.XAI_WEBHOOK_SECRET), d1_bound: Boolean(env.DB), environment: env.VVA_ENV || "unset" });
    }
    if (req.method !== "POST" || url.pathname !== "/xai/sip-webhook") return new Response("Not found", { status: 404 });
    const body = await req.text();
    if (!env.XAI_WEBHOOK_SECRET || !env.DB) return json({ error: "not_configured" }, 503); // fail-closed
    const ok = await verifyStandardWebhook(env.XAI_WEBHOOK_SECRET, req.headers, body, Number(env.SIGNATURE_TOLERANCE_SEC || 300));
    if (!ok) return json({ error: "invalid_signature" }, 401);

    const wid = req.headers.get("webhook-id");
    const ins = await env.DB.prepare("INSERT OR IGNORE INTO webhook_events (webhook_id, received_at) VALUES (?, ?)").bind(wid, new Date().toISOString()).run();
    if (!ins.meta.changes) return json({ duplicate: true, reason: "DUPLICATE_WEBHOOK_ID" }); // Replay / Retry

    let evt; try { evt = JSON.parse(body); } catch { return json({ error: "bad_json" }, 400); }
    if (evt.type !== "realtime.call.incoming" || !evt.data?.call_id) return json({ ignored: true });
    const call_id = String(evt.data.call_id).slice(0, 100);
    await env.DB.prepare("UPDATE webhook_events SET call_id=? WHERE webhook_id=?").bind(call_id, wid).run();
    const to = normalizeE164(header(evt.data.sip_headers, "To"));
    const from = normalizeE164(header(evt.data.sip_headers, "From"));

    const d = await admit(env, { call_id, from, to });
    if (!d.accept) {
      // Nicht annehmen: keiner Session beitreten; Anruf aktiv beenden, falls ein Key vorhanden ist.
      if (!d.duplicate && env.XAI_API_KEY && env.DRY_RUN !== "true") ctx.waitUntil(fetch(`${xai(env)}/v1/realtime/calls/${encodeURIComponent(call_id)}/hangup`, { method: "POST", headers: { Authorization: `Bearer ${env.XAI_API_KEY}` } }).catch(() => {}));
      return json({ accepted: false, duplicate: !!d.duplicate, reason: d.reason });
    }
    const stub = env.CALLS.get(env.CALLS.idFromName(call_id));
    await stub.fetch("https://do/start", { method: "POST", body: JSON.stringify({ call_id, from, cfg: d }) });
    return json({ accepted: true });
  },
  async scheduled(_e, env) { await purge(env); },
};

export class CallSession {
  constructor(state, env) { this.state = state; this.env = env; }

  async fetch(req) {
    const p = await req.json();
    if (await this.state.storage.get("started")) return new Response("duplicate"); // eine Session pro call_id
    await this.state.storage.put({ started: Date.now(), call_id: p.call_id });
    await this.state.storage.setAlarm(Date.now() + p.cfg.max_call_minutes * 60000);
    if (this.env.DRY_RUN === "true") { await logAction(this.env, p.call_id, p.cfg.agent_id, "session", "DRY_RUN_STARTED", null, null); return new Response("ok"); }
    this.state.waitUntil(this.run(p).catch(async (e) => {
      await endCall(this.env, p.call_id, await this.state.storage.get("started"), e);
      await this.callAction(p.call_id, "hangup").catch(() => {});
    }));
    return new Response("ok");
  }

  async alarm() { // Höchstdauer erreicht
    const call_id = await this.state.storage.get("call_id");
    await logAction(this.env, call_id, null, "max_duration", "HANGUP", null, null);
    if (this.env.DRY_RUN !== "true") await this.callAction(call_id, "hangup").catch(() => {});
    await endCall(this.env, call_id, await this.state.storage.get("started"), "MAX_DURATION_REACHED");
  }

  async run({ call_id, cfg }) {
    const resp = await fetch(`${xai(this.env)}/v1/realtime?call_id=${encodeURIComponent(call_id)}`, { headers: { Upgrade: "websocket", Authorization: `Bearer ${this.env.XAI_API_KEY}` } });
    const ws = resp.webSocket; if (!ws) throw new Error("xai_ws_failed_" + resp.status);
    ws.accept();
    const send = (o) => ws.send(JSON.stringify(o));
    send({ type: "session.update", session: cfg.session });
    // Begrüßung mit KI-Hinweis; laut SIP-Doku beginnt der Agent mit response.create
    send({ type: "response.create", response: { instructions: `Sage wörtlich: "${cfg.greeting}"` } });
    const pending = []; const seen = new Set(); let locked = false;
    ws.addEventListener("message", async (m) => {
      if (typeof m.data !== "string") return;
      let ev; try { ev = JSON.parse(m.data); } catch { return; }
      const t = ev.type || "";
      if (t === "conversation.item.input_audio_transcription.completed") {
        await transcript(this.env, call_id, "anrufer", ev.transcript || "");
        const hit = !locked && guard(cfg.guard, ev.transcript);
        if (hit) { // deterministisch, unabhängig vom Modell
          locked = true; send({ type: "response.cancel" });
          send({ type: "response.create", response: { instructions: `Sage wörtlich: "${hit.text}"`, tools: [] } });
          await logAction(this.env, call_id, cfg.agent_id, "guard_trigger", "FORCED_HANDOFF", { matched: hit.matched }, null);
          const prep = await runTool(this.env, call_id, "an_mensch_uebergeben", { grund: "trigger:" + hit.matched.join(","), zusammenfassung: String(ev.transcript || "").slice(0, 500) });
          if (prep.status === "uebergabe") await this.refer(call_id, prep, send);
          locked = false;
        }
        return;
      }
      if (t === "response.output_audio_transcript.done") { await transcript(this.env, call_id, "assistent", ev.transcript || ""); return; }
      let fc = null;
      if (t === "response.function_call_arguments.done") fc = ev;
      else if (t === "response.output_item.done" && ev.item?.type === "function_call") fc = ev.item;
      if (fc && !seen.has(fc.call_id)) {
        seen.add(fc.call_id);
        let result = await runTool(this.env, call_id, fc.name, fc.arguments);
        if (result.status === "uebergabe") result = await this.refer(call_id, result, null);
        pending.push({ type: "conversation.item.create", item: { type: "function_call_output", call_id: fc.call_id, output: JSON.stringify(result) } });
      }
      if (t === "response.done" && pending.length) { for (const c of pending.splice(0)) send(c); send({ type: "response.create" }); }
    });
    await new Promise((r) => ws.addEventListener("close", r));
    await endCall(this.env, call_id, await this.state.storage.get("started"));
    await this.state.storage.deleteAlarm();
  }

  async refer(call_id, prep, send) {
    let status = 0, body = "";
    if (prep.target) { const r = await fetch(`${xai(this.env)}/v1/realtime/calls/${encodeURIComponent(call_id)}/refer`, { method: "POST", headers: { Authorization: `Bearer ${this.env.XAI_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ target_uri: prep.target }) }); status = r.status; body = await r.text(); }
    const res = await handoffResult(this.env, call_id, prep.payload, status, body || (prep.target ? "" : "NO_HANDOFF_NUMBER"));
    if (send && res.sage) send({ type: "response.create", response: { instructions: `Sage wörtlich: "${res.sage}"` } });
    return res;
  }

  async callAction(call_id, action, body) {
    const r = await fetch(`${xai(this.env)}/v1/realtime/calls/${encodeURIComponent(call_id)}/${action}`, { method: "POST", headers: { Authorization: `Bearer ${this.env.XAI_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify(body || {}) });
    return r.status;
  }
}

// ---- Helfer ----
export async function verifyStandardWebhook(secret, headers, body, toleranceSec = 300) {
  const id = headers.get("webhook-id"), ts = headers.get("webhook-timestamp"), sigs = headers.get("webhook-signature");
  if (!id || !ts || !sigs) return false;
  const now = Math.floor(Date.now() / 1000);
  if (!/^\d+$/.test(ts) || Math.abs(now - Number(ts)) > toleranceSec) return false;
  const raw = secret.startsWith("whsec_") ? secret.slice(6) : secret;
  let keyBytes; try { keyBytes = Uint8Array.from(atob(raw), (c) => c.charCodeAt(0)); } catch { return false; }
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${id}.${ts}.${body}`)));
  const expected = btoa(String.fromCharCode(...mac));
  return sigs.split(" ").some((s) => { const [v, sig] = s.split(","); return v === "v1" && timingSafeEqual(sig || "", expected); });
}
function timingSafeEqual(a, b) { if (a.length !== b.length) return false; let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0; }
function header(list, name) { const h = (list || []).find((x) => (x.name || "").toLowerCase() === name.toLowerCase()); return h ? h.value : null; }
export function normalizeE164(v) {
  if (!v) return null;
  const m = String(v).match(/(?:sip:|tel:)?(\+?\d[\d\s\-()]{5,})/); if (!m) return null;
  let n = m[1].replace(/[^\d+]/g, ""); if (n.startsWith("00")) n = "+" + n.slice(2); if (n.startsWith("0")) n = "+49" + n.slice(1); if (!n.startsWith("+")) n = "+" + n;
  return /^\+\d{8,15}$/.test(n) ? n : null;
}
const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json" } });
