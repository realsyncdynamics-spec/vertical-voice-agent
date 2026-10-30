/**
 * vva-sip-webhook – Cloudflare Worker für Vertical Voice Agent (Grok Voice 3.0, xAI SIP).
 *
 * Ablauf:
 *  1. xAI sendet POST realtime.call.incoming (Standard-Webhooks-Signatur) an /xai/sip-webhook
 *  2. Signatur + Zeitstempel prüfen (fail-closed: ungültig -> 401, kein Anruf-Handling)
 *  3. Angerufene Nummer (To) -> Mandant aus KV VVA_TENANTS ("num:+49...")
 *  4. Unbekannt / nicht active / nicht telephony_approved / TELEPHONY_ENABLED != "true"
 *       -> Durable Object spricht nur die Sperransage und legt auf (keine Tools)
 *  5. Sonst Durable Object CallSession: wss://api.x.ai/v1/realtime?call_id=... (join_sip_call-Pfad),
 *     session.update (aus realtime_session_config), Begrüßung per force_message, Function Calls,
 *     deterministische Trigger-Prüfung auf Anrufertranskripten -> feste Übergabe-Ansage + refer.
 *
 * Secrets: XAI_API_KEY, XAI_WEBHOOK_SECRET (wrangler secret put). Nichts davon im Repo.
 */

const BLOCKED_TEXT = "Ich bin ein KI-Assistent. Dieser Sprachassistent ist aktuell nicht freigeschaltet. Bitte wenden Sie sich direkt an den Betrieb.";
const XAI = "https://api.x.ai";

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === "GET" && url.pathname === "/health") {
      return json({ ok: true, service: "vva-sip-webhook", telephony_enabled: env.TELEPHONY_ENABLED === "true", secrets_configured: Boolean(env.XAI_API_KEY && env.XAI_WEBHOOK_SECRET) });
    }
    if (req.method !== "POST" || url.pathname !== "/xai/sip-webhook") return new Response("Not found", { status: 404 });

    const body = await req.text();
    if (!env.XAI_WEBHOOK_SECRET || !env.XAI_API_KEY) return json({ error: "not_configured" }, 503); // fail-closed
    const ok = await verifyStandardWebhook(env.XAI_WEBHOOK_SECRET, req.headers, body, Number(env.SIGNATURE_TOLERANCE_SEC || 300));
    if (!ok) return json({ error: "invalid_signature" }, 401);

    let evt;
    try { evt = JSON.parse(body); } catch { return json({ error: "bad_json" }, 400); }
    if (evt.type !== "realtime.call.incoming" || !evt.data?.call_id) return json({ ignored: true });

    const callId = evt.data.call_id;
    const to = normalizeE164(header(evt.data.sip_headers, "To"));
    const from = normalizeE164(header(evt.data.sip_headers, "From"));
    const tenant = to ? await env.VVA_TENANTS.get("num:" + to, "json") : null;

    let mode = "blocked", reason = null;
    if (env.TELEPHONY_ENABLED !== "true") reason = "TELEPHONY_DISABLED";
    else if (!tenant) reason = "UNKNOWN_NUMBER";
    else if (!tenant.active) reason = "AGENT_NOT_ACTIVE";
    else if (!tenant.telephony_approved) reason = "TELEPHONY_NOT_APPROVED";
    else mode = "active";

    const stub = env.CALLS.get(env.CALLS.idFromName(callId));
    await stub.fetch("https://do/start", { method: "POST", body: JSON.stringify({ callId, from, to, mode, reason, tenant: mode === "active" ? tenant : null }) });
    return json({ accepted: true, mode, reason });
  },
};

export class CallSession {
  constructor(state, env) { this.state = state; this.env = env; }

  async fetch(req) {
    const p = await req.json();
    // Session läuft weiter, nachdem der Webhook beantwortet ist
    this.state.waitUntil(this.run(p).catch(async (e) => {
      await this.log(p.callId, { error: String(e) });
      await this.callAction(p.callId, "hangup").catch(() => {});
    }));
    return new Response("ok");
  }

  async run({ callId, from, to, mode, reason, tenant }) {
    const resp = await fetch(`${XAI}/v1/realtime?call_id=${encodeURIComponent(callId)}`, {
      headers: { Upgrade: "websocket", Authorization: `Bearer ${this.env.XAI_API_KEY}` },
    });
    const ws = resp.webSocket;
    if (!ws) throw new Error("xai_ws_failed_" + resp.status);
    ws.accept();
    const send = (o) => ws.send(JSON.stringify(o));
    await this.log(callId, { from, to, mode, reason, agent_id: tenant?.agent_id || null, started_at: new Date().toISOString() });

    if (mode !== "active") {
      send({ type: "session.update", session: { voice: "eve", instructions: "Sage nur die vorgegebene Ansage. Rufe keine Werkzeuge auf.", tools: [] } });
      send(forceMessage(BLOCKED_TEXT));
      await sleep(11000);
      await this.callAction(callId, "hangup").catch(() => {});
      ws.close();
      return;
    }

    const session = structuredClone(tenant.session_update.session);
    delete session.audio?.input?.format; delete session.audio?.output?.format; // Audio wird von xAI aus SIP gebrückt
    send({ type: "session.update", session });
    send(tenant.greeting_event); // KI-Hinweis wörtlich, nicht unterbrechbar

    const pending = []; const seen = new Set(); let done = false;
    ws.addEventListener("message", async (m) => {
      if (typeof m.data !== "string" || done) return;
      const ev = JSON.parse(m.data); const t = ev.type || "";
      if (t === "conversation.item.input_audio_transcription.completed") {
        const hit = guard(tenant, ev.transcript || "");
        if (hit) {
          done = true;
          send({ type: "response.cancel" });
          send(forceMessage(hit.text));
          await this.log(callId, { guard: hit.matched });
          await sleep(7000);
          await this.transfer(callId, tenant);
          return;
        }
      }
      let fc = null;
      if (t === "response.function_call_arguments.done") fc = ev;
      else if (t === "response.output_item.done" && ev.item?.type === "function_call") fc = ev.item;
      if (fc && !seen.has(fc.call_id)) {
        seen.add(fc.call_id);
        let args = {}; try { args = JSON.parse(fc.arguments || "{}"); } catch {}
        const result = await this.tool(callId, tenant, fc.name, args, from);
        pending.push({ type: "conversation.item.create", item: { type: "function_call_output", call_id: fc.call_id, output: JSON.stringify(result) } });
        if (fc.name === "handoff_human" && result.status === "ok") { setTimeout(() => this.transfer(callId, tenant), 4000); }
      }
      if (t === "response.done" && pending.length) {
        for (const c of pending.splice(0)) send(c);
        send({ type: "response.create" });
      }
    });
    await new Promise((r) => ws.addEventListener("close", r));
    await this.log(callId, { ended_at: new Date().toISOString() });
  }

  async tool(callId, tenant, name, args, from) {
    if (!(tenant.enabled_tools || []).includes(name)) return { status: "blocked", reason: "TOOL_NOT_ENABLED" };
    if (name === "lookup_kb") return { status: "ok", opening_hours: tenant.kb?.opening_hours || null, note: "Nur diese Angaben verwenden; Unbekanntes als Rückrufbitte aufnehmen." };
    if (name === "create_ticket" || name === "schedule_appointment") {
      // Terminbuchung im Worker: als Termin-Wunsch-Ticket erfassen (Kalenderprüfung erfolgt im Backend, fail-closed)
      const id = "tkt-" + Date.now() + "-" + crypto.randomUUID().slice(0, 6);
      const rec = { ticket_id: id, agent_id: tenant.agent_id, kind: name === "schedule_appointment" ? "appointment_request" : "callback_request", caller: from, args, created_at: new Date().toISOString(), channel: "telephony" };
      await this.env.VVA_TENANTS.put(`ticket:${tenant.agent_id}:${id}`, JSON.stringify(rec), { expirationTtl: 60 * 60 * 24 * 30 });
      return name === "schedule_appointment"
        ? { status: "APPOINTMENT_REQUEST_RECORDED", ticket_id: id, response: "Ich habe Ihren Terminwunsch notiert. Das Team prüft den Kalender und bestätigt Ihnen den Termin per Rückruf." }
        : { status: "ok", ticket_id: id };
    }
    if (name === "handoff_human") return { status: "ok", transfer: Boolean(tenant.handoff_number) };
    return { status: "blocked", reason: "UNKNOWN_TOOL" };
  }

  async transfer(callId, tenant) {
    if (tenant.handoff_number && /^\+\d{8,15}$/.test(tenant.handoff_number)) {
      const s = await this.callAction(callId, "refer", { target_uri: "tel:" + tenant.handoff_number });
      await this.log(callId, { refer_status: s });
      if (s === 200) return;
    }
    // keine/fehlgeschlagene Weiterleitung -> Rückrufbitte anbieten (Session bleibt offen)
  }

  async callAction(callId, action, body) {
    const r = await fetch(`${XAI}/v1/realtime/calls/${encodeURIComponent(callId)}/${action}`, {
      method: "POST", headers: { Authorization: `Bearer ${this.env.XAI_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify(body || {}),
    });
    return r.status;
  }

  async log(callId, entry) {
    const k = "calllog:" + callId;
    const cur = (await this.env.VVA_TENANTS.get(k, "json")) || [];
    cur.push(entry);
    await this.env.VVA_TENANTS.put(k, JSON.stringify(cur), { expirationTtl: 60 * 60 * 24 * 30 });
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
function guard(tenant, text) {
  const low = text.toLowerCase();
  const trig = (tenant.trigger_keywords || []).filter((k) => low.includes(k));
  const forb = (tenant.forbidden_keywords || []).filter((k) => low.includes(k));
  if (!trig.length && !forb.length) return null;
  return { matched: trig.length ? trig : forb, text: trig.length ? tenant.handoff_response : "Dazu darf ich als KI-Assistent keine verbindliche Auskunft oder Zusage geben. Ich verbinde Sie mit einem Mitarbeitenden." };
}
function forceMessage(text) { return { type: "conversation.item.create", item: { type: "force_message", role: "assistant", interruptible: false, content: [{ type: "output_text", text }] } }; }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json" } });
