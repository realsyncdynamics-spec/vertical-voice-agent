# Telefonie anbinden

**Stand:** 30.10.2026 · Vertical Voice Agent (eigenständiges Produkt außerhalb von RealSyncDynamics.AI)

Ihr Telefonassistent läuft auf **Grok Voice 3.0** (xAI Speech to Speech). Telefonie ist **standardmäßig gesperrt**: Bis alle Punkte unten erfüllt und freigegeben sind, bleibt der Agent im Status *Entwurf/pausiert* und ist nur als Web-Demo nutzbar. Auf dieser Website gibt es bewusst **keine Live-Rufnummer** zum Testen.

## Was Sie brauchen

| Punkt | Wer | Hinweis |
|---|---|---|
| Paket Professional oder Kanzlei / Praxis | Sie | Starter ist Web-only |
| Eigene Rufnummer (Festnetz/Mobil, E.164, z. B. +49 3679 …) | Sie | Ihre bestehende Nummer oder eine neue Nummer Ihres Anbieters |
| Rufnummer beim Telefonie-Anbieter | Sie / wir gemeinsam | bevorzugt Telnyx (deutsche Ortsrufnummer), alternativ Twilio |
| Weiterleitung auf den Assistenten | Sie | Rufumleitung (sofort, bei besetzt oder nach X Sekunden) von Ihrer Nummer auf die Trunk-Nummer |
| Übergabe-Nummer (E.164) | Sie | Dorthin verbindet der Assistent bei Notfällen und auf Wunsch |
| Telefonie-Freigabe (`telephony_approved`) | Sie, ausdrücklich | Im Onboarding, Schritt 4 |
| KI-Offenlegung aktiv | Pflicht | Jede Begrüßung nennt den KI-Assistenten |
| Datenschutzprüfung dokumentiert | Pflicht für Kanzlei, Praxis, Steuerberatung | Ohne sie bleiben alle Werkzeuge gesperrt |
| Aufzeichnung | standardmäßig aus | Nur mit ausdrücklicher Freigabe und Aufbewahrungsfrist |

## Empfohlener Anbieter und Ihre bestehende Rufnummer

- **Bevorzugt: Telnyx.** Die Anbindung an Grok Voice ist von xAI dokumentiert. Deutsche Ortsrufnummern sind verfügbar, Verbindungsdaten und Aufzeichnungen können in Deutschland (Frankfurt) gespeichert werden. Alternative: Twilio.
- **Ihre Nummer behalten Sie.** Bei Ihrem bisherigen Anbieter (z. B. Telekom, sipgate, easybell) richten Sie eine Rufumleitung ein – sofort, bei besetzt oder nach einigen Sekunden – auf die Nummer Ihres Assistenten. Klassische deutsche SIP-Trunks wie sipgate oder easybell leiten Anrufe nicht direkt an Grok Voice weiter; dafür ist die Rufumleitung der einfachste Weg.
- **Ehrlicher Datenschutzhinweis:** Die Sprachverarbeitung erfolgt durch xAI (Grok Voice). Dabei werden Gesprächsinhalte auch außerhalb der EU verarbeitet. Wir sagen deshalb **keine** reine EU-Verarbeitung zu; Details stehen in Ihrem Auftragsverarbeitungsvertrag und den Datenschutzhinweisen.
- **Nachvollziehbar und begrenzt:** Pro Anruf wird ein Aktionsprotokoll geführt (Beginn, Ende, Dauer, Aktionen, Übergabe, Fehler – kein Audio; Mitschrift nur, wenn Sie sie aktivieren; Aufbewahrungsfrist einstellbar). Höchstdauer pro Anruf (Standard 10 Minuten), Minutenbudget pro Monat und maximale gleichzeitige Anrufe sind fest eingestellt.
- **Kein Testanschluss:** Es gibt auf dieser Website keine Live-Rufnummer. Ihr Anschluss wird erst nach Ihrer Telefonie-Freigabe aktiv.

## So wird angebunden (technischer Ablauf)

1. **Nummer bei xAI registrieren:** `POST https://api.x.ai/v2/phone-numbers` mit `origin: "byo_trunk"`, Ihrer Nummer, unserer Webhook-Adresse und SIP-Absicherung (IP-Allowlist oder Digest). Das Signatur-Geheimnis wird sicher serverseitig abgelegt, niemals im Repository.
2. **Trunk beim Anbieter einrichten:** Ziel `sip:{Ihre-Nummer}@sip.voice.x.ai;transport=tls` (alternativ TCP/UDP Port 5060).
3. **Eingehender Anruf:** xAI sendet ein signiertes Ereignis `realtime.call.incoming`; wir prüfen die Signatur und lesen die `call_id`.
4. **Assistent übernimmt:** Verbindung `wss://api.x.ai/v1/realtime?call_id=…`, Konfiguration Ihres Mandanten (Stimme, Regeln, nur freigegebene Werkzeuge), Begrüßung mit KI-Hinweis wörtlich.
5. **Im Gespräch:** Anliegen klären, Zusammenfassung bestätigen lassen, dann genau eine von drei Aktionen: **Anliegen erfassen**, **Terminwunsch aufnehmen** (am Telefon wird kein Termin fest zugesagt – „Wir melden uns zur Bestätigung.“) oder **an einen Menschen übergeben**. Klappt die Weiterleitung nicht, legt der Assistent eine Rückrufbitte an und sagt das dem Anrufer. Kritische Stichworte führen – unabhängig vom Sprachmodell – zu einer festen Übergabe-Ansage und Weiterleitung an Ihre Übergabe-Nummer.

## Was der Assistent am Telefon kann

- Mehrstufiger Dialog mit Rückfragen und Bestätigung
- Werkzeuge nur laut Branchenvorlage: Auskunft (`lookup_kb`), Rückrufbitte (`create_ticket`), Termin (`schedule_appointment`), Übergabe (`handoff_human`)
- Kalender: Google oder Outlook
- Sofortige Übergabe bei branchenspezifischen Notfällen und Beschwerden

## Was er nicht tut

- Keine Rechts-, Medizin- oder Steuerberatung, keine Fristprüfung, keine Diagnose
- Keine Allergie- oder Spurenfreiheitsgarantie, keine verbindlichen Preis- oder Einsatzzusagen
- Keine garantierte Compliance-Zusage; Sie bleiben für Ihre Freigaben verantwortlich

## Datenschutzhinweis für Anrufer (Vorlage)

> Sie sprechen mit einem KI-Assistenten von **[Betrieb]**. Verantwortlich für die Verarbeitung ist **[Betrieb, Anschrift, Kontakt]**. Ihr Gespräch wird in Echtzeit von der Sprach-KI Grok Voice der xAI (USA) verarbeitet; dabei werden Daten auch außerhalb der EU verarbeitet (weltweit, abgesichert über EU-Standardvertragsklauseln im Auftragsverarbeitungsvertrag). xAI speichert Gesprächsinhalte nicht (Zero Data Retention). Wir speichern kein Audio. Gespeichert werden nur Ihr Anliegen, Name und Rückrufnummer sowie ein Aktionsprotokoll des Anrufs; eine Mitschrift nur, wenn der Betrieb sie aktiviert hat. Löschung nach **[X] Tagen**. Zweck: Bearbeitung Ihres Anliegens (Art. 6 Abs. 1 lit. b bzw. f DSGVO). Sie haben das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung, Widerspruch und Beschwerde bei einer Aufsichtsbehörde. Möchten Sie nicht mit der KI sprechen, sagen Sie „Mitarbeiter“ – wir verbinden Sie oder rufen zurück.

Dieser Text ist eine Vorlage und ersetzt keine Rechtsberatung. Telefonie wird erst freigeschaltet, wenn Zero Data Retention bei xAI aktiv und der Auftragsverarbeitungsvertrag unterschrieben ist. Wir sagen keine reine EU-Verarbeitung zu.

## Status ohne Freigabe

Fehlt eine Pflichtfreigabe, antwortet ein Anruf nur mit: „Dieser Sprachassistent ist aktuell nicht freigeschaltet. Bitte wenden Sie sich direkt an den Betrieb.“ – keine Werkzeuge, keine Datenerfassung.

[Jetzt im Onboarding einrichten](onboarding.html)
