# VVA Go-live – Reihenfolge und Checkliste für Dominik (Stand 30.10.2026)

Telefonie bleibt aus (`TELEPHONY_ENABLED=false`), bis Schritt 4 abgeschlossen ist.

## 1. Telnyx DE-Nummer (längste Vorlaufzeit – zuerst)
Unterlagen:
- [ ] Firmenadresse identisch mit Gewerbeanmeldung
- [ ] Adressnachweis nicht älter als 3 Monate (z. B. Nebenkosten-/Telefonrechnung, Kontoauszug) – Adresse im Ortsnetz der Nummer
- [ ] Gewerbeanmeldung (PDF)
- [ ] Nutzungsbeschreibung (deutsch) – Text unten
- [ ] Ortsnetz (Vorwahl) passend zum Gewerbestandort wählen
- [ ] Beim Kauf physisch in Deutschland
- [ ] **Offene Frage:** Wird auf „RealSync Dynamics & AI“ umbenannt bzw. das Gewerbe umgemeldet? Dann Nummer erst mit den finalen Unterlagen beantragen (sonst Neuantrag).
Technik danach (xAI-Doku): FQDN SIP Connection → `sip.voice.x.ai`, Port 5060, Record-Typ A, Zielformat E.164, Codec G.711 µ-law/A-law oder G.722. Nummer bei xAI als `byo_trunk` mit Webhook `https://vva-sip-webhook-test.realsyncdynamics.workers.dev/xai/sip-webhook` registrieren; Signing-Secret wird nur einmal geliefert → als Worker-Secret setzen.

### Nutzungsbeschreibung für den Telnyx-Antrag (zum Einfügen)
> KI-Telefonassistent für eingehende Anrufe von Handwerksbetrieben und weiteren kleinen und mittleren Betrieben in Deutschland, Österreich und der Schweiz (z. B. Kfz-Werkstätten, Metzgereien, Gastronomie, Hausverwaltungen, Praxen, Kanzleien, Steuerberatungen). Die Nummer nimmt ausschließlich eingehende Anrufe von Kunden des jeweiligen Betriebs entgegen. Der Assistent gibt sich zu Beginn als KI zu erkennen, nimmt Anliegen, Rückrufbitten und Terminwünsche auf und leitet bei Bedarf an einen Mitarbeiter des Betriebs weiter. Es finden keine Werbeanrufe, keine ausgehenden Massenanrufe, kein Massenversand von SMS und kein Spam statt. Ausgehende Verbindungen entstehen nur als Weiterleitung eines laufenden Kundengesprächs an den Betrieb.

## 2. xAI: Auftragsverarbeitung + Zero Data Retention (parallel zu 1)
- [ ] **ZDR zuerst im TEST-Team aktivieren** (xAI Console → Team-Einstellungen; wirkt für alle Keys des Teams). Nicht zuerst im Prod-Team.
  - Bekannte Folgen: Responses-API (stateful), Files, Collections, Batch API deaktiviert; Voice-Gesprächsverlauf nicht verfügbar. Auswirkung auf SIP-Session-Resumption unklar (VVA nutzt Resumption nicht).
  - [ ] Danach Live-Smoke erneut laufen lassen (`node test/smoke-live.mjs`, Erwartung 10/10) – erst dann ZDR im Prod-Team.
- [ ] DPA (https://x.ai/legal/data-processing-addendum) annehmen/unterzeichnen. Laut DPA dürfen personenbezogene Daten nur über die ZDR-API verarbeitet werden.
- [ ] Datenschutzhinweis für Anrufer übernehmen (Vorlage: https://voice.realsyncdynamicsai.de/telefonie.html). Keine EU-Hosting-Zusage; Verarbeitung USA/weltweit mit Standardvertragsklauseln.
- [ ] Eigenen xAI-Key für Prod anlegen (Prod-Team).

## 3. Prod-Worker + D1 (während Telnyx prüft) – bereitgestellt
- Worker `https://vva-sip-webhook-prod.realsyncdynamics.workers.dev` (Telefonie aus, ohne Secrets → 503 fail-closed), D1 `vva_telephony_prod` (nur 8 Vorlagen, keine Mandanten).
- [ ] Prod-Secrets setzen: `XAI_API_KEY` (Prod-Key), `XAI_WEBHOOK_SECRET` (von xAI).
- [ ] Ersten Mandanten mit Nummer, Übergabe-Nummer, Budgets, Telefonie-Freigabe in D1 anlegen.

## 4. Testanrufe (später)
- [ ] Testanrufe auf dem Test-Worker mit kurzzeitig `TELEPHONY_ENABLED=true` (nur nach deinem Go), Protokoll prüfen, dann Prod.

## 5. Stripe vor Live-Checkout
- [ ] Live-Konto heißt **„RealSync Dynamics IA“** (geprüft, nur lesend). Im Stripe-Dashboard → Einstellungen → Unternehmen/Öffentliche Details: Unternehmensname, öffentlicher Name und Abrechnungs-/Statement-Descriptor (z. B. `REALSYNC DYNAMICS AI`) korrigieren. Nicht von uns geändert.
