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
Im Verzeichnis `workers/vva-sip-webhook` mit Node.js >= 22:
- `npm ci && npm test` – lokale Miniflare-Tests, kein PSTN und keine xAI-Kosten (zuletzt dokumentiert: 37/37).
- `npm run test:mandant` – lokale Prüfung der Kundenkonfiguration (zuletzt dokumentiert: 9/9).
- `node test/smoke-live.mjs` – **nur nach bewusster Freigabe und mit Test-Zugangsdaten** `XAI_API_KEY` und `VVA_TEST_WHSEC`. Nutzt das versionierte, fiktive `scripts/beispiel-kunde.json` und die Vorlagen aus `migrations/0002_seed.sql` (kein lokaler Entwicklerpfad). Prüft `/health` vor dem signierten Test-Webhook: `environment=test`, `d1_bound=true`, `telephony_enabled=false`. Ohne Zugangsdaten oder bei aktiver Telefonie bricht der Test vorher ab. Fehlschläge liefern Exit-Code 1. Er testet **keine echte SIP-/PSTN-Verbindung** und schaltet die Telefonie nicht ein.

## Noch keine Go-live-Freigabe
- In `wrangler.toml` sind die beiden D1-`database_id`-Felder noch Platzhalter (`REPLACE_WITH_D1_ID`, `REPLACE_WITH_PROD_D1_ID`). Die tatsächlichen IDs müssen im jeweiligen Cloudflare-Konto **lesend geprüft** werden; niemals durch erfundene Werte ersetzen oder mit diesen Platzhaltern deployen.
- `TELEPHONY_ENABLED=false` gilt für Test und Produktion. Kein produktives Deployment oder Freischalten ohne ausdrücklich genehmigte Tests, xAI-DPA/ZDR, registrierte Rufnummer, Freigabe des Mandanten und tatsächlichen SIP-Test.
- Die automatische Zustellung der in D1 erfassten Anliegen an Kunden ist **nicht implementiert**. Eine manuelle Abfrage ist möglich (siehe unten); ein späterer Benachrichtigungskanal benötigt geklärte Empfänger, Einwilligungen/Vertrag, Zustellfehlerbehandlung und sichere Geheimnisverwaltung.

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
