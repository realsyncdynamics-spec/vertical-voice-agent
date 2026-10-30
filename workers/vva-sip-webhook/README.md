# vva-sip-webhook (Cloudflare Worker)

Eingehende Anrufe: Telnyx (+49) → `sip:{nummer}@sip.voice.x.ai` → xAI sendet `realtime.call.incoming` → **dieser Worker** → Durable Object `CallSession` verbindet `wss://api.x.ai/v1/realtime?call_id=…` (Grok Voice 3.0).

**Status (30.10.2026):** deployt auf `https://vva-sip-webhook.realsyncdynamics.workers.dev` mit `TELEPHONY_ENABLED=false`, **ohne Secrets** → jede Webhook-Anfrage wird mit 503 abgewiesen (fail-closed). `/health` zeigt den Zustand. Keine Nummer gekauft, kein Anruf.

## Fail-closed-Regeln
| Situation | Verhalten |
|---|---|
| Secrets fehlen | 503, kein Anruf-Handling |
| Signatur ungültig / älter als 5 Min. | 401 |
| `TELEPHONY_ENABLED` ≠ `true` | Sperransage, Auflegen |
| Nummer unbekannt (kein KV-Eintrag) | Sperransage, Auflegen |
| Mandant nicht active / nicht `telephony_approved` | Sperransage, Auflegen |
| Trigger-Stichwort im Anrufertranskript | feste Übergabe-Ansage, Weiterleitung an `handoff_number` |
| Tool nicht in der Vorlage | `blocked` |
| Terminwunsch | als Ticket (Kalenderprüfung im Backend), keine Direktbuchung im Worker |

## Deploy / Aktivieren
```bash
cd workers/vva-sip-webhook
npx wrangler deploy                          # Code + KV + Durable Object
npx wrangler secret put XAI_API_KEY          # xAI-Key (nie ins Repo)
npx wrangler secret put XAI_WEBHOOK_SECRET   # whsec_… aus POST /v2/phone-numbers
# Mandanten exportieren (Store): python3 export_worker_config.py
npx wrangler kv bulk put --binding VVA_TENANTS worker_kv_bulk.json
# erst nach Dominiks Go:
#   wrangler.toml -> TELEPHONY_ENABLED = "true"; npx wrangler deploy
```
Lokaler Test der Signaturprüfung: `node test.mjs`.

## Telnyx-Checkliste (Dominik)
1. Konto unter https://portal.telnyx.com anlegen, Zahlungsmittel hinterlegen.
2. Account settings → Profile → **Data Storage Location: Germany**.
3. Numbers → Search: deutsche Ortsnummer (z. B. Vorwahl 036…) → Unterlagen: Ausweis, Gewerbeanmeldung, Adressnachweis < 3 Monate (Adresse im Vorwahlbereich), Telnyx-Registrierungsformular. Prüfung ca. 72 h.
4. Voice → SIP Trunking → **FQDN Connection** anlegen: FQDN `sip.voice.x.ai`, Port 5060, Record Type A; Inbound: Nummernformat **E.164**; Codecs G.711 A-law/µ-law (optional G.722).
5. Nummer dieser Connection zuweisen.
6. Uns die Nummer (E.164) nennen. Wir registrieren sie bei xAI:
   `POST https://api.x.ai/v2/phone-numbers` mit `origin:"byo_trunk"`, `phone_number`, `webhook.url = https://vva-sip-webhook.realsyncdynamics.workers.dev/xai/sip-webhook`, `sip_auth.allowed_addresses` = Telnyx-Signalisierungsnetze. Das zurückgegebene Signing-Secret wird nur als Worker-Secret gesetzt.
7. Im Mandanten `phone_number`, `handoff_number` (E.164) und `telephony_approved` setzen, KV exportieren.
8. Go für den ersten Testanruf.
