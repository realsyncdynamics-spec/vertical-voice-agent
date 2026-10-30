# Vertical Voice Agent – Produktmappe

**Stand:** 29.10.2026  
**Anbieter:** Dominik Steiner, Einzelunternehmen, Schwarzburger Str. 31, 98724 Neuhaus am Rennweg (Thüringen, Deutschland)  
**Produktstatus:** Eigenständiges Produkt außerhalb von RealSyncDynamics.AI

---

## 1. Was ist der Vertical Voice Agent?

Ein KI-Sprachassistent für kleine und mittlere Betriebe, vorkonfiguriert für 8 Branchen. Er beantwortet Standardfragen, nimmt Anliegen und Rückrufbitten auf, bucht – wo freigegeben – Termine und übergibt kritische Fälle sofort an Menschen.

- **Sicherheit zuerst:** Der Assistent darf nur, was die Branchenvorlage ausdrücklich erlaubt. Fehlt eine Freigabe, ist er gesperrt (Fail-Closed).
- **Klare Grenzen:** keine Rechts-, Medizin- oder Steuerberatung, keine garantierte Compliance-Zusage.
- **Transparenz:** Jede Begrüßung weist darauf hin, dass ein KI-Assistent spricht.
- **Kanäle:** Web-Sprachassistent; Telefonie optional ab Paket Professional (nach ausdrücklicher Freigabe).

## 2. Fail-Closed-Sicherheitsmodell

Ein Assistent wird nur aktiv, wenn alle Pflichtfreigaben vorliegen. Bei jedem Fehler wird er auf „pausiert“ gesetzt und alle Werkzeuge sind gesperrt.

| Regel | Wirkung |
|---|---|
| KI-Offenlegung | Pflicht in jeder Begrüßung; ohne sie keine Aktivierung |
| Werkzeuge | nur wenn Assistent aktiv **und** Konfiguration gültig; nur die Werkzeuge der Branchenvorlage |
| Telefonie | nur mit ausdrücklicher Freigabe; nicht im Paket Starter |
| Aufzeichnung / Transkripte | nur mit ausdrücklicher Freigabe **und** festgelegter Aufbewahrungsfrist (Tage > 0) |
| Sensible Branchen (elevated) | Kanzlei, Praxis, Steuerberatung: Aktivierung erst nach dokumentierter Datenschutzprüfung |
| Kritische Stichworte | sofortige Übergabe an Mitarbeitende (siehe Branchenvorlagen) |
| Verbotene Zusagen | werden abgelehnt und an Mitarbeitende übergeben |

## 3. Die 8 Branchenvorlagen

| Branche | Sensibilität | Werkzeuge | Terminbuchung | Empfohlenes Paket |
|---|---|---|---|---|
| Handwerk (`trades`) | standard | `lookup_kb`, `create_ticket`, `schedule_appointment`, `handoff_human` | ja | Professional |
| Metzgerei (`butcher`) | standard | `lookup_kb`, `create_ticket`, `handoff_human` | **nein** (Rückruf-Ticket) | Starter |
| Rechtsanwaltskanzlei (`law_office`) | erhöht (elevated) | `lookup_kb`, `create_ticket`, `schedule_appointment`, `handoff_human` | ja | Kanzlei / Praxis |
| KFZ-Werkstatt & Autohaus (`auto_repair`) | standard | `lookup_kb`, `create_ticket`, `schedule_appointment`, `handoff_human` | ja | Professional |
| Gastronomie & Bäckerei (`gastronomy`) | standard | `lookup_kb`, `create_ticket`, `schedule_appointment`, `handoff_human` | ja | Starter |
| Hausverwaltung & Immobilien (`property_management`) | standard | `lookup_kb`, `create_ticket`, `schedule_appointment`, `handoff_human` | ja | Professional |
| Arzt- & Zahnarztpraxis (`medical_practice`) | erhöht (elevated) | `lookup_kb`, `create_ticket`, `schedule_appointment`, `handoff_human` | ja | Kanzlei / Praxis |
| Steuerberatung & Wirtschaftsprüfung (`tax_advisory`) | erhöht (elevated) | `lookup_kb`, `create_ticket`, `schedule_appointment`, `handoff_human` | ja | Kanzlei / Praxis |

Werkzeuge: `lookup_kb` = Wissensabfrage (FAQ, Öffnungszeiten, Leistungen); `create_ticket` = Anliegen/Rückrufbitte als Ticket erfassen; `schedule_appointment` = Terminbuchung im Kalender; `handoff_human` = Übergabe an Mitarbeitende.

### Handwerk (`trades`)
- **Sensibilität:** standard
- **Sofortige Übergabe an Menschen bei:** Gefahr, Gasgeruch, Wasserrohrbruch, Stromausfall, Funkenflug, Reklamation, Wunsch nach Mitarbeiter
- **Verbotene Zusagen:** Verbindliche Festpreiszusage ohne Vor-Ort-Prüfung, Garantierte Sofortreparatur, Notdienst-Einsatzzeitpunkt ohne Dispositionsfreigabe
- **Beispiel-Begrüßung:** „Guten Tag! Ich bin der KI-Sprachassistent Ihres Handwerksbetriebs. Wie kann ich Ihnen bei Terminanfragen oder einem Anliegen helfen? Hinweis: Bei akuter Gefahr wie Gasgeruch oder Rohrbruch verbinde ich Sie sofort weiter.“

### Metzgerei (`butcher`)
- **Sensibilität:** standard
- **Sofortige Übergabe an Menschen bei:** Schwere Allergie / Anaphylaxie-Risiko, Reklamation, Catering-Sonderanfrage, Wunsch nach Fachpersonal
- **Verbotene Zusagen:** Allergiegarantie, Garantie auf 100%ige Freiheit von Spuren/Kreuzkontamination, Verbindliche Reservierung ausverkaufter Tagesware ohne Bestätigung
- **Beispiel-Begrüßung:** „Grüß Gott! Ich bin der KI-Sprachassistent Ihrer Metzgerei. Ich helfe Ihnen gerne bei Fragen zu unserem Sortiment, Öffnungszeiten oder Vorbestellungen. Für verbindliche Allergen-Auskünfte verbinde ich Sie direkt mit unserem Fachpersonal.“

### Rechtsanwaltskanzlei (`law_office`)
- **Sensibilität:** elevated – Aktivierung nur nach dokumentierter Datenschutzprüfung
- **Sofortige Übergabe an Menschen bei:** Fristsache, Eilrechtsschutz, Haft / Durchsuchung, Kündigung / Zustellung mit Fristablauf, Mandatskonflikt / Beschwerde, Wunsch nach Kanzleimitarbeiter
- **Verbotene Zusagen:** Rechtsberatung, Mandat angenommen, Frist geprüft, Erfolgsaussichten bewertet
- **Beispiel-Begrüßung:** „Guten Tag. Sie sprechen mit dem KI-Sprachassistenten der Kanzlei. Ich nehme gerne Ihr Anliegen oder einen Terminwunsch auf. Bitte beachten Sie, dass ich keine Rechtsberatung erteile, keine Fristen prüfe und durch dieses Gespräch noch kein Mandatsverhältnis entsteht. Handelt es sich um eine dringende Fristsache?“

### KFZ-Werkstatt & Autohaus (`auto_repair`)
- **Sensibilität:** standard
- **Sofortige Übergabe an Menschen bei:** Unfall / Panne auf der Straße, Bremsausfall / rote Warnleuchte / Rauchentwicklung, Reklamation nach Reparatur, Wunsch nach Werkstattleiter
- **Verbotene Zusagen:** Verbindliche Festpreis- oder Kostenvoranschlagszusage ohne Fahrzeugdiagnose, Bestätigung der Weiterfahr-Sicherheit bei Brems- oder Lenkungsdefekt, Garantierte HU/TÜV-Zuteilung ohne Prüfung
- **Beispiel-Begrüßung:** „Guten Tag! Ich bin der KI-Sprachassistent Ihrer KFZ-Werkstatt. Ich helfe Ihnen gerne bei Werkstattterminen, Reifenwechsel oder Rückfragen. Bei einer akuten Panne, Unfall oder roter Warnleuchte verbinde ich Sie sofort mit unserem Serviceberater.“

### Gastronomie & Bäckerei (`gastronomy`)
- **Sensibilität:** standard
- **Sofortige Übergabe an Menschen bei:** Schwere Lebensmittelallergie / Zöliakie / Anaphylaxie, Reklamation, Gruppenreservierung / Bankett ab 15 Personen, Wunsch nach Serviceleitung
- **Verbotene Zusagen:** Verbindliche Allergie- oder Spurenfreiheitsgarantie, Garantie auf 100 % gluten- oder nussfreie Zubereitung ohne Kreuzkontamination, Verbindliche Exklusivbuchung ohne Bestätigung der Betriebsleitung
- **Beispiel-Begrüßung:** „Herzlich willkommen! Ich bin der KI-Sprachassistent Ihres Gastronomiebetriebs. Gerne nehme ich Ihre Tischreservierung oder Vorbestellung auf. Für verbindliche Auskünfte zu Allergenen und Spuren verbinde ich Sie direkt mit unserer Serviceleitung.“

### Hausverwaltung & Immobilien (`property_management`)
- **Sensibilität:** standard
- **Sofortige Übergabe an Menschen bei:** Rohrbruch / Wasserschaden / Heizungsausfall im Winter, Brand / Gasgeruch / Aufzugseinschluss, Fristlose Kündigung / Mietrechtsstreit, Wunsch nach Objektbetreuer
- **Verbotene Zusagen:** Zusage einer Kostenübernahme oder Mietminderung, Rechtsverbindliche Mietvertragszusage am Telefon, Freigabe kostenpflichtiger Handwerkereinsätze ohne Deckungsprüfung
- **Beispiel-Begrüßung:** „Guten Tag! Sie sprechen mit dem KI-Sprachassistenten Ihrer Hausverwaltung. Ich erfasse gerne Ihre Schadensmeldung oder Ihr Mieteranliegen. Bei akuten Notfällen wie Rohrbruch, Heizungsausfall oder Aufzugsstörung verbinde ich Sie sofort mit dem Notdienst.“

### Arzt- & Zahnarztpraxis (`medical_practice`)
- **Sensibilität:** elevated – Aktivierung nur nach dokumentierter Datenschutzprüfung
- **Sofortige Übergabe an Menschen bei:** Medizinischer Notfall / Atemnot / Brustschmerz / starke Blutung, Akuter Schmerzfall, Frage zu Labor- oder Befundergebnissen, Wunsch nach medizinischem Fachpersonal
- **Verbotene Zusagen:** Medizinische Diagnose oder Therapieempfehlung, Verbindliche Zusage von Rezepten oder Arbeitsunfähigkeitsbescheinigungen ohne ärztliche Prüfung, Telefonische Herausgabe sensibler Befunddaten
- **Beispiel-Begrüßung:** „Guten Tag. Sie sprechen mit dem KI-Sprachassistenten der Praxis. Ich nehme gerne Ihren Terminwunsch oder Ihr Anliegen auf. Bitte beachten Sie, dass ich keine medizinische Beratung oder Diagnose erteile. Bei einem akuten Notfall wählen Sie bitte sofort die 112 oder lassen Sie sich direkt mit dem Praxisteam verbinden.“

### Steuerberatung & Wirtschaftsprüfung (`tax_advisory`)
- **Sensibilität:** elevated – Aktivierung nur nach dokumentierter Datenschutzprüfung
- **Sofortige Übergabe an Menschen bei:** Finanzamt-Frist / Einspruchsfrist läuft ab, Betriebsprüfung / Steuerfahndung / Vollstreckung, Kontopfändung / Schätzungsbescheid, Wunsch nach Steuerberater oder Fachmitarbeiter
- **Verbotene Zusagen:** Verbindliche steuerliche Beratung oder Gestaltungsempfehlung, Zusage, dass eine Steuer- oder Einspruchsfrist gewahrt oder verlängert wurde, Mandatsannahme ohne schriftlichen Steuerberatungsvertrag
- **Beispiel-Begrüßung:** „Guten Tag. Sie sprechen mit dem KI-Sprachassistenten der Steuerberatungskanzlei. Ich nehme gerne Ihr Anliegen oder einen Terminwunsch auf. Bitte beachten Sie, dass ich keine steuerliche Beratung erteile und keine Fristen prüfe. Handelt es sich um einen dringenden Fristablauf beim Finanzamt?“

## 4. Pakete & Preise

Alle Preise monatlich, netto zzgl. 19 % MwSt. Je Paket 1 Agent.

| Paket | Preis netto | Preis brutto | Kanäle | Inklusivminuten | Jede weitere Minute (netto) |
|---|---|---|---|---|---|
| **Starter** | 89,00 € | 105,91 € | Web | 500 Min. | 0,18 € |
| **Professional** | 199,00 € | 236,81 € | Web + Telefonie-Option | 1.500 Min. | 0,15 € |
| **Kanzlei / Praxis** | 349,00 € | 415,31 € | Web + Telefonie-Option, Datenschutzprüfung (elevated) inkl. | 1.200 Min. | 0,18 € |

**Rechenbeispiel Professional, 1.800 Min./Monat:** 199,00 € + 300 × 0,15 € = 244,00 € netto (290,36 € brutto).

## 5. Kalenderanbindung – Ihre Wahl

Für Branchen mit Terminbuchung wählen Sie beim Onboarding Ihren Kalender. Ohne Angabe gilt Google Kalender.

| | Google Kalender (empfohlen) | Outlook Kalender (Alternative) |
|---|---|---|
| Rolle | Hauptkalender, Standard | unterstützte Alternative |
| Verfügbarkeitsprüfung | vor jeder Buchung zweimal | vor jeder Buchung zweimal (zusätzlich abgesichert über eine Terminsuche) |
| Termine über die Anbindung entfernen | möglich | **derzeit nicht möglich** – ggf. selbst in Outlook entfernen |
| Zielkalender | Hauptkalender oder ein bestimmter Kalender (E-Mail-Adresse) | immer der Kalender des verbundenen Outlook-Kontos |
| Hinweis | – | Bei der Outlook-Anbindung kann es zu Verbindungsproblemen kommen |

## 6. Regeln für Terminbuchungen

Ein Termin wird nur eingetragen, wenn **alle** Prüfungen bestehen. Andernfalls wird nicht gebucht, die Ablehnung protokolliert und dem Anrufer ein anderer Termin oder ein Rückruf angeboten.

1. **Freigabe:** Betrieb aktiv und gültig, Terminbuchung in der Branchenvorlage erlaubt, bei sensiblen Branchen Datenschutzprüfung dokumentiert.
2. **Zeitzone:** Europe/Berlin; der Termin muss in der Zukunft liegen.
3. **Öffnungszeiten:** Der Termin muss vollständig in einem Öffnungsfenster liegen. Standard ohne Angabe: Mo–Fr 08:00–18:00, Sa/So geschlossen (nie rund um die Uhr).
4. **Feiertage & Betriebsferien:** frei eintragbare Schließtage und Betriebsferien; optional automatisch die gesetzlichen Feiertage des Bundeslands (Standard Thüringen). Ohne Eintrag wird nichts gesperrt.
5. **Freie Zeit im Kalender:** Prüfung vor der Vormerkung.
6. **Zweite Prüfung direkt vor dem Eintragen:** muss frisch sein (höchstens 5 Minuten alt) und „frei“ ergeben; sonst keine Buchung.
7. **Zielkalender:** optional pro Betrieb (E-Mail-Format); wird er zwischen Prüfung und Eintrag geändert, bricht die Buchung ab. Ohne Angabe: Hauptkalender des verbundenen Kontos.

Ist die Kalenderprüfung nicht möglich oder fehlerhaft, wird ebenfalls **nicht** gebucht.

## 7. Self-Service-Onboarding in 6 Schritten

Sie richten den Assistenten komplett selbst ein – eine Angebotsanfrage ist nicht nötig. Eine Klickanleitung erklärt jedes Feld, und ein Hilfe-Bot beantwortet Fragen jederzeit.

1. **Branchenvorlage wählen** – eine der 8 Vorlagen.
2. **Betriebsdaten, Paket, Kanal & Kalender** – Name, Übergabe-Kontakt, Paket, Kanal, Kalender (Google oder Outlook, optional Zielkalender).
3. **Öffnungszeiten, Feiertage & Betriebsferien** – Zeiten je Wochentag, gesetzliche Feiertage je Bundesland, eigene Schließzeiten.
4. **Sicherheits- & Datenschutzfreigaben** – KI-Offenlegung, Telefonie-Freigabe, Datenschutzprüfung (elevated), Aufzeichnung nur mit Freigabe und Aufbewahrungsfrist.
5. **Fail-Closed-Prüfung & Live-Status** – automatische Validierung und Branchen-Testgespräche; nur bei vollständigen Freigaben aktiv, sonst pausiert.
6. **Herunterladen** – Konfiguration (.json, ohne Zugangsdaten) und Onboarding-Protokoll (.md).

Ein schriftliches Angebot ist optional.

**Hilfe-Bot:** Auf allen Seiten unten rechts. Er beantwortet Fragen zu Paketen, Onboarding, Kalender, Terminbuchung und Sicherheit auf Basis dieser Produktangaben, läuft vollständig im Browser (keine Daten werden gesendet), gibt keine Rechts-, Medizin- oder Steuerberatung und verweist bei Notfällen auf 112/110.

## 8. Links

- **Verkaufsseite:** https://realsyncdynamics-spec.github.io/vertical-voice-agent/
- **Self-Service-Onboarding:** https://realsyncdynamics-spec.github.io/vertical-voice-agent/onboarding.html
- **Klickanleitung für Kunden:** https://realsyncdynamics-spec.github.io/vertical-voice-agent/anleitung.html
- **Produktmappe (dieses Dokument):** https://realsyncdynamics-spec.github.io/vertical-voice-agent/vertical-voice-agent-produktmappe.md
- **Vertriebs-Pitch-Deck (.pptx):** https://realsyncdynamics-spec.github.io/vertical-voice-agent/vertical-voice-agent-pitch-deck.pptx
- **GitHub-Repository:** https://github.com/realsyncdynamics-spec/vertical-voice-agent

## 9. Selbst starten oder Angebot anfragen

Am schnellsten: selbst einrichten unter https://realsyncdynamics-spec.github.io/vertical-voice-agent/onboarding.html.
Optional: unverbindliches Angebot über **„Angebot anfragen“** auf der Verkaufsseite (https://realsyncdynamics-spec.github.io/vertical-voice-agent/#angebot) oder per E-Mail an realsyncdynamics@gmail.com. Verbindlich sind ausschließlich die Konditionen im schriftlichen Angebot.

---

## Impressum

Dominik Steiner, Einzelunternehmen  
Schwarzburger Str. 31  
98724 Neuhaus am Rennweg  
Thüringen, Deutschland  
E-Mail: realsyncdynamics@gmail.com

*Der Vertical Voice Agent erteilt keine Rechts-, Medizin- oder Steuerberatung und gibt keine garantierte Compliance-Zusage.*

## Sprachdemos (Stand 30.10.2026)
Landingpage-Abschnitt „Stimmen anhören“ (#stimmen) und Onboarding: 6 deutsche Beispielaufnahmen (Handwerk, Gastronomie/Bäckerei, KFZ, Metzgerei, Hausverwaltung, Arztpraxis), erzeugt mit Microsoft Edge Neural TTS (Conrad, Katja, Killian, Amala). Illustrativ; Stimme und Ansprache werden im Onboarding festgelegt. Keine Rechts-, Medizin-, Steuer- oder Allergenauskünfte in den Skripten.

## Grok-Stimmen (Stand 30.10.2026)

Ihr Assistent spricht mit einer der **28 integrierten Grok-Stimmen** (Grok Voice / Grok TTS). Alle Stimmen sprechen Deutsch; die Wahl erfolgt im Self-Service-Onboarding und wird als `voice_id` in der Mandantenkonfiguration gespeichert. Standard: `eve`. Unbekannte `voice_id` → Agent bleibt pausiert (Fail-Closed).

| Empfehlung | Stimmen |
|---|---|
| Betriebe (DACH, standard) | castor, atlas, celeste, ursa, rigel, lux, ara, rex, sal |
| Kanzlei, Praxis, Steuerberatung (elevated) | lux, liora, aurora, celeste |
| Alle Stimmen | ara, eve, leo, rex, sal, altair, atlas, aurora, carina, castor, celeste, cosmo, helios, helix, iris, kepler, liora, lumen, luna, lux, naksh, orion, perseus, rigel, sirius, ursa, zagan, zenith |

Die Hörbeispiele auf der Website sind mit Grok TTS erzeugt (castor, ursa, atlas, sal, rigel, aurora). Im Betrieb spricht der Assistent über Grok Voice mit der gewählten Stimme.

## Telefonassistent: mehr als eine Ansage

- **Mehrstufiger Dialog:** Begrüßung mit KI-Hinweis → Anliegen erkennen → fehlende Angaben einzeln nachfragen (Name, Rückrufnummer, Wunschtermin, Anliegen) → Zusammenfassung vorlesen und bestätigen lassen → erst dann Aktion.
- **Werkzeuge (nur laut Vorlage):** `lookup_kb` (Öffnungszeiten, Betriebsinfos), `create_ticket` (Rückrufbitte), `schedule_appointment` (wo freigegeben), `handoff_human`.
- **Termine:** Prüfung von Öffnungszeiten, Feiertagen, Betriebsferien und Kalender (Google oder Outlook, zweifach) vor jeder Buchung. Ist kein Termin möglich, bietet der Assistent eine andere Zeit oder eine Rückrufbitte an.
- **Sofortige Übergabe:** branchenspezifische Trigger (z. B. Gasgeruch, Unfall, Fristsache, Atemnot), verbotene Zusagen oder Wunsch nach einem Menschen.
- **Grenzen:** keine Rechts-, Medizin- oder Steuerberatung, keine Fristprüfung, keine Allergie- oder Spurenfreiheitsgarantie. Elevated-Branchen erst nach dokumentierter Datenschutzprüfung.
- **Fail-Closed:** nicht freigeschalteter Agent → nur Hinweisansage, keine Werkzeuge.
