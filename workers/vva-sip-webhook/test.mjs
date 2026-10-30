// Lokaler Test: Signaturprüfung + Nummernnormalisierung (ohne Netzwerk)
import { verifyStandardWebhook, normalizeE164 } from "./src/index.js";
import crypto from "node:crypto";
const secret = "whsec_" + crypto.randomBytes(24).toString("base64");
const body = JSON.stringify({ type: "realtime.call.incoming", data: { call_id: "x" } });
const id = "evt_1", ts = String(Math.floor(Date.now() / 1000));
const sig = crypto.createHmac("sha256", Buffer.from(secret.slice(6), "base64")).update(`${id}.${ts}.${body}`).digest("base64");
const H = (o) => new Headers(o);
const ok = await verifyStandardWebhook(secret, H({ "webhook-id": id, "webhook-timestamp": ts, "webhook-signature": "v1," + sig }), body);
const bad = await verifyStandardWebhook(secret, H({ "webhook-id": id, "webhook-timestamp": ts, "webhook-signature": "v1,AAAA" }), body);
const old = await verifyStandardWebhook(secret, H({ "webhook-id": id, "webhook-timestamp": String(Number(ts) - 900), "webhook-signature": "v1," + sig }), body);
const tampered = await verifyStandardWebhook(secret, H({ "webhook-id": id, "webhook-timestamp": ts, "webhook-signature": "v1," + sig }), body + " ");
console.log({ valid: ok, badSig: bad, expired: old, tampered, e164: [normalizeE164("sip:+4936791234@sip.voice.x.ai"), normalizeE164("036791 234"), normalizeE164("abc")] });
if (!ok || bad || old || tampered) process.exit(1);
