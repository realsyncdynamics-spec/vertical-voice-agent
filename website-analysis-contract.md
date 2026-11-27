# Voice: optionale Unternehmensanalyse

Status: Spezifikation, kein freigeschalteter Endpunkt.

## Wiederverwendung
RealSyncDynamics.AI: supabase/functions/_shared/public-scan/{target,observe}.ts als Referenz für Zielprüfung, DNS-Prüfung, manuelle Redirects und begrenztes Streaming. README bindet die bestehenden Module an den kanonischen Audit-Pfad; Voice darf keinen zweiten Audit-Datensatz erzeugen. Keine direkte Verdrahtung ohne Entscheidung über Schnittstelle und Netzisolation.

## Schnittstelle (geplant)
POST /website-profile, authentifizierter oder kurzlebig autorisierter Entwurf, body { origin }, serverseitig erneut validiert. Keine Zugangsdaten, Pfade, Queryparameter oder Fragmente. Kein anonymer unlimitierter Fetch. Antwort: status, source_origin, observed_at, candidates: [{ field, value, source_url, evidence }]. Zulässige Felder: business_name, industry, services, opening_hours, public_contact, faq. Fehlende Informationen bleiben leer. Kein KI- oder Compliance-Score.

## Sicherheitsgates
- Netzwerkabruf isoliert, an geprüfte öffentliche Ziel-IP gebunden oder durch kontrollierten Egress-Proxy abgesichert; DNS-Rebinding, IPv4/IPv6 und jeder Redirect müssen fail-closed behandelt werden. Die vorhandene fetch-basierte Prüfung allein genügt nicht.
- Nur öffentliche HTML-Seiten, maximal 5 Redirects, 12 Sekunden Gesamtdeadline, 1,5 MB Gesamtbudget; keine Skriptausführung, Cookies, Zugangsdaten oder Formulare.
- Rate limit, Budgetreservierung vor kostenpflichtiger Verarbeitung; keine unkontrollierten Retries.
- Website-Inhalt ist nicht vertrauenswürdige Eingabe; keine Tool-Aufrufe, keine Prompt- oder Freigabeänderung aus Website-Text.
- Keine dauerhafte Speicherung des HTML-Rohmaterials. Nur bestätigte Unternehmensdaten in autorisiertem Mandantenentwurf speichern.
- Kunde bestätigt jeden Vorschlag; keine automatische Kalender-, Telefonie-, Aufzeichnungs- oder Datenschutzfreigabe.
- Fehler oder fehlender Endpunkt: manueller Wizard bleibt verfügbar. Keine erfundenen Ergebnisse.

## Abnahme vor Aktivierung
Tests: private DNS-Ziele, DNS-Rebinding, Redirect auf internes Ziel, Timeout, Übergröße, falscher Content-Type, Budgetlimit, fremder Mandant, Prompt-Injection, leere Daten, manuelle Alternative, Bestätigung vor Übernahme. Browser-E2E für Landing → Domain → Wizard → Kandidaten → Kundenbestätigung. Keine produktive Aktivierung ohne Freigabe.
