# vva-sip-webhook

Steuerebene für VVA-Telefonie (xAI SIP → Webhook → Durable Object pro call_id → D1). Architektur: `../../ARCHITECTURE.md`.

## Umgebungen
| | Worker | D1 | Telefonie |
|---|---|---|---|
| Test | `vva-sip-webhook-test` | `vva_telephony_test` | aus |
| Alt (KV, wird ersetzt) | `vva-sip-webhook` | – | aus |
| Prod | `vva-sip-webhook-prod` (`wrangler deploy --env production`) | `vva_telephony_prod` | aus |

## Secrets (nur Namen – Werte nie im Repo)
| Name | Test | Prod |
|---|---|---|
| `XAI_API_KEY` | gesetzt (30.10.2026) | eigener Prod-Key, noch offen |
| `XAI_WEBHOOK_SECRET` | gesetzt (generiert, `whsec_…`); bei Registrierung der Nummer durch das von xAI gelieferte Signing-Secret ersetzen | offen |

Setzen: `wrangler secret put XAI_API_KEY --name vva-sip-webhook-test`

## Tests
- `npm test` – 34 lokale Tests (Miniflare, kein Netz)
- `node test/smoke-live.mjs` – Live-Smoke ohne PSTN (Env `XAI_API_KEY`, `VVA_TEST_WHSEC`): Test-Worker mit echter Signatur + xAI-WebSocket ohne `call_id`

## Ersten Kunden anlegen (`scripts/mandant.mjs`)
Erzeugt nur eine SQL-Datei, führt nichts aus. Kundendaten liegen in `kunden/` (per `.gitignore` ausgeschlossen, das Repo ist öffentlich).
1. `scripts/beispiel-kunde.json` nach `kunden/<name>.json` kopieren und ausfüllen (Rufnummer und Weiterleitung in E.164).
2. `node scripts/mandant.mjs pruefen kunden/<name>.json` – gleiche Prüfung wie der Worker (`validateTenant`).
3. `node scripts/mandant.mjs sql kunden/<name>.json` – schreibt `kunden/<name>.sql`; Sichtprüfung, dann
   `npx wrangler d1 execute vva_telephony_prod --env production --remote --file kunden/<name>.sql`.
4. Telefonie bleibt gesperrt, bis `telefonie_freigegeben: true` **und** `avv_unterzeichnet_am` gesetzt sind; Kanzlei/Praxis/Steuerberatung zusätzlich erst mit `datenschutzpruefung_dokumentiert: true`.
5. Anfragen abrufen (Zustellung an den Betrieb ist noch nicht automatisiert):
   `node scripts/mandant.mjs anfragen <agent_id> --tage 7 --out kunden/anfragen.sql` und mit `--json` über `wrangler d1 execute` abfragen.

Tests: `npm run test:mandant` (ohne Netz, ohne Abhängigkeiten).
