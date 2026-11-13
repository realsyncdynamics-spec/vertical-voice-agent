# Telefonie anbinden

**Stand:** 30.10.2026 · Vertical Voice Agent (eigenständiges Produkt außerhalb von RealSyncDynamics.AI)

**Status: Demo / Vorschau.** Demo / Vorschau: Telefonie, WhatsApp und ein Live-Sprachagent sind derzeit nicht verfügbar. Die genannten Pakete und Preise sind unverbindliche Beispielangaben (monatlich, netto zuzüglich 19 % Umsatzsteuer, Bruttopreis angegeben). Eine Buchung oder Bestellung ist derzeit nicht möglich. Das Angebot richtet sich an Unternehmer und Betriebe, nicht an Verbraucherinnen und Verbraucher. Sprachverarbeitung über SpaceXSI / xAI (Grok Voice) kann außerhalb der EU stattfinden, unter anderem in den USA; ein fester Verarbeitungsort, insbesondere eine EU-Residenz, wird nicht zugesagt. Einzelheiten zu Empfänger, Transfergrundlage (EU-Standardvertragsklauseln, nicht das EU-US Data Privacy Framework) und Ihren Rechten finden Sie in den [Datenschutzhinweisen](telefonie.html#datenschutz).

Ein Telefonassistent auf Grok Voice 3.0 (xAI Speech-to-Speech) ist **geplant** und derzeit nicht verfügbar. Eine Freischaltung, eine Live-Rufnummer oder eine Buchung gibt es auf dieser Seite nicht. Die folgenden Schritte beschreiben die vorgesehene Anbindung, nicht einen bereits bestellbaren Dienst.

## Was Sie brauchen

| Punkt | Wer | Hinweis |
|---|---|---|
| Paket Professional oder Kanzlei / Praxis | Sie | Starter ist Web-only; Kanzlei / Praxis und Telefonie sind **geplant**, nicht bestellbar |
| Eigene Rufnummer (Festnetz/Mobil, E.164, z. B. +49 3679 …) | Sie | Ihre bestehende Nummer oder eine neue Nummer Ihres Anbieters |
| Rufnummer beim Telefonie-Anbieter | Sie / wir gemeinsam | bevorzugt Telnyx (deutsche Ortsrufnummer), alternativ Twilio |
| Weiterleitung auf den Assistenten | Sie | Rufumleitung (sofort, bei besetzt oder nach X Sekunden) von Ihrer Nummer auf die Trunk-Nummer |
| Übergabe-Nummer (E.164) | Sie | Dorthin verbindet der Assistent bei Notfällen und auf Wunsch |
| Telefonie-Freigabe (`telephony_approved`) | Sie, ausdrücklich | Im Onboarding, Schritt 4 |
| KI-Offenlegung aktiv | Pflicht | Jede Begrüßung nennt den KI-Assistenten |
| Datenschutzprüfung dokumentiert | Pflicht für Kanzlei, Praxis, Steuerberatung | Ohne sie bleiben alle Werkzeuge gesperrt |
| Aufzeichnung | standardmäßig aus | Nur mit ausdrücklicher Freigabe und Aufbewahrungsfrist |

## Empfohlener Anbieter und Ihre bestehende Rufnummer

- **Telnyx / Twilio (geplant):** Bevorzugt vorgesehen ist Telnyx (deutsche Ortsrufnummern sind nach Anbieterangaben verfügbar), alternativ Twilio. Eine Speicherung von Verbindungsdaten und Aufzeichnungen in der EU (Dokumentation: Data Locality „Germany“; Verarbeitungsstandort des EU-Endpunkts `api.telnyx.eu` ist Frankfurt) erfolgt **nicht automatisch**. Standardmäßig speichert Telnyx in den USA. Eine Speicherung in Deutschland setzt eine einmalige, unumkehrbare Konto-Einstellung „Data Storage Location = Germany“ voraus; der Endpunkt `api.telnyx.eu` steuert die Anfrageverarbeitung und ist bei Ausfall nicht ausschließlich EU-gebunden. Maßgeblich sind die Telnyx-Dokumentation zu Data Locality und Regional Endpoints sowie der Telnyx-DPA ([https://developers.telnyx.com/docs/account-setup/data-locality](https://developers.telnyx.com/docs/account-setup/data-locality), [https://developers.telnyx.com/docs/account-setup/regional-endpoints](https://developers.telnyx.com/docs/account-setup/regional-endpoints), [https://telnyx.com/legal/data-processing-addendum](https://telnyx.com/legal/data-processing-addendum)). Solange diese Einstellung und der AVV nicht vorliegen, sagen wir keine Speicherung in Frankfurt und keine EU-only-Telefonie zu.
- **Ihre Nummer behalten Sie.** Bei Ihrem bisherigen Anbieter (z. B. Telekom, sipgate, easybell) richten Sie eine Rufumleitung ein – sofort, bei besetzt oder nach einigen Sekunden – auf die Nummer Ihres Assistenten. Klassische deutsche SIP-Trunks wie sipgate oder easybell leiten Anrufe nicht direkt an Grok Voice weiter; dafür ist die Rufumleitung der einfachste Weg.
- **Datenschutzhinweis (in Prüfung):** Die Sprachverarbeitung erfolgt durch SpaceX Super Intelligence LLC (SpaceXSI / xAI, Grok Voice) als Auftragsverarbeiter. Sie kann außerhalb der EU stattfinden; der globale Endpunkt des Anbieters sagt keinen Verarbeitungsort zu, der dokumentierte US-Endpunkt gilt nicht für Voice-APIs (Quelle: [https://docs.x.ai/developers/advanced-api-usage/regions](https://docs.x.ai/developers/advanced-api-usage/regions)). Eine reine EU-Verarbeitung wird nicht zugesagt. Soweit personenbezogene Daten übermittelt werden, geschieht das auf Grundlage eines Auftragsverarbeitungsvertrags mit EU-Standardvertragsklauseln (Art. 46 Abs. 2 lit. c, Art. 28 DSGVO; [https://x.ai/legal/data-processing-addendum](https://x.ai/legal/data-processing-addendum)) und nur über die Zero-Data-Retention-Schnittstelle. SpaceXSI ist nicht als aktiver Teilnehmer des EU-US Data Privacy Framework gelistet (offizielle Liste, Abruf 13. November 2026). Eine Kopie der Klauseln erhalten Sie auf Anfrage. Dieser Absatz wird nur verwendet, wenn AVV und ZDR für den konkreten Zugang nachweislich gelten; andernfalls unterbleibt jede Produktions- oder Telefonie-Zusage.
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

**Anrufer-Hinweis — Vorlage, nicht verwenden (in Prüfung).** Dieser Text wird erst eingesetzt, wenn ein Auftragsverarbeitungsvertrag mit SpaceX Super Intelligence LLC einschließlich der EU-Standardvertragsklauseln geschlossen und Zero-Data-Retention für den konkreten Zugang nachgewiesen ist. Bis dahin wird keine Telefonie angeboten. Der folgende Entwurf ist keine aktuelle Zusage und beschreibt keinen laufenden Dienst.

> Sie sprechen mit einem KI-Sprachassistenten, nicht mit einem Menschen. Sie können jederzeit eine Verbindung mit einer Mitarbeiterin oder einem Mitarbeiter verlangen. Verantwortlich für die Verarbeitung wäre **[Betrieb, Anschrift, Kontakt]**. Eine Verarbeitung durch SpaceXSI / xAI (Grok Voice) außerhalb der EU, unter anderem in den USA, käme nur nach nachgewiesenem Auftragsverarbeitungsvertrag und aktivem Zero-Data-Retention in Betracht; das ist derzeit in Prüfung und nicht zugesagt.

Dieser Text ist eine Vorlage und ersetzt keine Rechtsberatung. Eine Freischaltung von Telefonie unterbleibt, solange AVV und ZDR nicht nachgewiesen sind. Eine reine EU-Verarbeitung und eine feste Verarbeitungsregion werden nicht zugesagt.

## Status ohne Freigabe

Fehlt eine Pflichtfreigabe, antwortet ein Anruf nur mit: „Dieser Sprachassistent ist aktuell nicht freigeschaltet. Bitte wenden Sie sich direkt an den Betrieb.“ – keine Werkzeuge, keine Datenerfassung.

Telefonie und SIP sind geplant und derzeit nicht verfügbar. [Interesse melden](mailto:realsyncdynamics@gmail.com?subject=Interesse%20Vertical%20Voice%20Agent) · [Onboarding-Demo](onboarding.html)
