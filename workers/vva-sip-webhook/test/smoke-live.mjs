// Live-Smoke ohne PSTN: (1) Test-Worker mit echter Signatur, (2) xAI Realtime-WebSocket OHNE call_id mit unserer Session-Konfiguration.
// Env: XAI_API_KEY, VVA_TEST_WHSEC (nie ausgeben). Aufruf: node test/smoke-live.mjs
import { createHmac, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import WebSocket from "ws";
import * as core from "../src/core.js";
const U = "https://vva-sip-webhook-test.realsyncdynamics.workers.dev";
const out = [];
const h = await (await fetch(U + "/health")).json(); out.push(["health", h.secrets_configured === true && h.telephony_enabled === false, JSON.stringify(h)]);
const raw = process.env.VVA_TEST_WHSEC.replace(/^whsec_/, "");
const body = JSON.stringify({ object: "event", id: "evt_smoke", type: "realtime.call.incoming", created_at: 1, data: { call_id: "smoke-" + randomUUID(), sip_headers: [{ name: "From", value: "+491701111111" }, { name: "To", value: "+4936791234" }], metadata: {} } });
const sig = (id, ts) => "v1," + createHmac("sha256", Buffer.from(raw, "base64")).update(`${id}.${ts}.${body}`).digest("base64");
const id = "msg_" + randomUUID(), ts = String(Math.floor(Date.now() / 1000));
const post = (hdr) => fetch(U + "/xai/sip-webhook", { method: "POST", headers: { "content-type": "application/json", ...hdr }, body }).then(async (r) => [r.status, await r.json()]);
let r = await post({ "webhook-id": id, "webhook-timestamp": ts, "webhook-signature": sig(id, ts) });
out.push(["signierter Webhook -> nicht angenommen (Telefonie aus)", r[0] === 200 && r[1].accepted === false && r[1].reason === "TELEPHONY_DISABLED", JSON.stringify(r)]);
r = await post({ "webhook-id": id, "webhook-timestamp": ts, "webhook-signature": sig(id, ts) }); out.push(["Replay -> duplicate", r[1].duplicate === true, JSON.stringify(r)]);
r = await post({ "webhook-id": "x", "webhook-timestamp": ts, "webhook-signature": "v1,AAAA" }); out.push(["falsche Signatur -> 401", r[0] === 401, String(r[0])]);

// xAI WebSocket ohne call_id (laut Doku normale Speech-to-Speech-Session)
const S = "/cursor/stores/store-8d5bca21-00e8-4084-a05f-43646dd48d75/vertical-voice-agent/";
const tpl = JSON.parse(readFileSync(S + "templates_and_validator.json")).templates.trades;
const tenant = { ...JSON.parse(readFileSync(S + "tenants/dominik-steiner-trades.json")), enabled_tools: ["create_ticket", "schedule_appointment", "handoff_human"] };
const cfg = core.sessionConfig(tenant, tpl);
const turns = ["Guten Tag, wann haben Sie morgen geöffnet?", "Hallo, meine Heizung ist ausgefallen. Ich heiße Max Muster, Rückrufnummer 0170 1234567. Bitte nehmen Sie das auf.", "Ja, genau so, bitte erfassen.", "Und ich hätte gern einen Termin Dienstag um 10 Uhr. Können Sie den fest bestätigen?", "Ja, bitte so aufnehmen."];
const ws = new WebSocket("wss://api.x.ai/v1/realtime?model=grok-voice-latest", { headers: { Authorization: "Bearer " + process.env.XAI_API_KEY } });
const calls = []; const texts = []; let turn = 0; const pending = [];
const send = (o) => ws.send(JSON.stringify(o));
const next = () => { if (turn >= turns.length) return ws.close(); send({ type: "conversation.item.create", item: { type: "message", role: "user", content: [{ type: "input_text", text: turns[turn++] }] } }); send({ type: "response.create", response: { modalities: ["text"] } }); };
await new Promise((res) => {
  const to = setTimeout(() => { ws.close(); }, 90000);
  ws.on("open", () => { send({ type: "session.update", session: { ...cfg.session, turn_detection: null } }); setTimeout(next, 800); });
  ws.on("message", async (m) => { const e = JSON.parse(m); const t = e.type;
    if (t === "error") texts.push("ERROR " + JSON.stringify(e.error).slice(0, 200));
    if ((t === "response.output_text.done" || t === "response.output_audio_transcript.done") && (e.text || e.transcript)) texts.push(e.text || e.transcript);
    let fc = t === "response.function_call_arguments.done" ? e : (t === "response.output_item.done" && e.item?.type === "function_call" ? e.item : null);
    if (fc && !calls.find((c) => c.id === fc.call_id)) { calls.push({ id: fc.call_id, name: fc.name, args: fc.arguments });
      const result = fc.name === "terminwunsch_aufnehmen" ? { status: "wunsch_notiert", bestaetigt: false, sage: "Ich habe Ihren Terminwunsch notiert. " + core.TERMIN_PHRASE } : { status: "erfasst", lead_id: "smoke" };
      pending.push({ type: "conversation.item.create", item: { type: "function_call_output", call_id: fc.call_id, output: JSON.stringify(result) } }); }
    if (t === "response.done") { if (pending.length) { pending.splice(0).forEach(send); send({ type: "response.create", response: { modalities: ["text"] } }); } else next(); } });
  ws.on("close", () => { clearTimeout(to); res(); }); ws.on("error", (e) => { texts.push("WSERR " + e.message); res(); });
});
const names = calls.map((c) => c.name);
out.push(["xAI-Session akzeptiert Konfiguration (keine error-Events)", !texts.some((x) => x.startsWith("ERROR") || x.startsWith("WSERR")), texts.filter((x) => /ERR/.test(x)).join(" ")]);
out.push(["Modell nutzt nur die drei Werkzeuge", names.length > 0 && names.every((n) => core.TOOL_NAMES.includes(n)), names.join(",")]);
out.push(["lead_erfassen aufgerufen", names.includes("lead_erfassen"), JSON.stringify(calls.find((c) => c.name === "lead_erfassen")?.args || "")]);
out.push(["terminwunsch_aufnehmen aufgerufen", names.includes("terminwunsch_aufnehmen"), JSON.stringify(calls.find((c) => c.name === "terminwunsch_aufnehmen")?.args || "")]);
out.push(["Öffnungszeiten-Frage: keine Adressfrage", texts[0] !== undefined && !/adresse|einsatzort|wo genau/i.test(texts[0]), texts[0] || ""]);
out.push(["Assistent bestätigt keinen Termin fest", !texts.some((x) => /termin (ist )?(fest )?(bestätigt|gebucht)/i.test(x) && !/nicht/i.test(x)), ""]);
for (const [n, okk, i] of out) console.log(okk ? "PASS" : "FAIL", "-", n, "::", i.slice(0, 220));
console.log("\nAssistent-Texte:\n- " + texts.join("\n- "));
