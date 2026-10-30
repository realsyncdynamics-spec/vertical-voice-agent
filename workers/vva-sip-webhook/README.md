# vva-sip-webhook

Steuerebene für VVA-Telefonie (xAI SIP → Webhook → Durable Object pro call_id → D1). Architektur: `../../ARCHITECTURE.md`.

## Umgebungen
| | Worker | D1 | Telefonie |
|---|---|---|---|
| Test | `vva-sip-webhook-test` | `vva_telephony_test` | aus |
| Alt (KV, wird ersetzt) | `vva-sip-webhook` | – | aus |
| Prod | noch nicht angelegt | – | aus |

## Secrets (nur Namen – Werte nie im Repo)
| Name | Test | Prod |
|---|---|---|
| `XAI_API_KEY` | gesetzt (30.10.2026) | eigener Prod-Key, noch offen |
| `XAI_WEBHOOK_SECRET` | gesetzt (generiert, `whsec_…`); bei Registrierung der Nummer durch das von xAI gelieferte Signing-Secret ersetzen | offen |

Setzen: `wrangler secret put XAI_API_KEY --name vva-sip-webhook-test`

## Tests
- `npm test` – 34 lokale Tests (Miniflare, kein Netz)
- `node test/smoke-live.mjs` – Live-Smoke ohne PSTN (Env `XAI_API_KEY`, `VVA_TEST_WHSEC`): Test-Worker mit echter Signatur + xAI-WebSocket ohne `call_id`
