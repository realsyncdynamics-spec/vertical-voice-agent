# Vertical Voice Agent – Produktmappe & 8 Branchenvorlagen (Stand: 28.10.2026)

**Anbieter:** Dominik Steiner (Einzelunternehmen)  
**Anschrift:** Schwarzburger Str. 31, 98724 Neuhaus am Rennweg, Thüringen, Deutschland  
**Produktstatus:** Eigenständiges Sprachassistenten-Produkt außerhalb von RealSyncDynamics.AI  
**Sicherheitsarchitektur:** Fail-Closed Gatekeeper-Modell (KI-Offenlegungspflicht, strikte Tool-Begrenzung, keine garantierten Compliance-Versprechen, keine Rechts-, Medizin- oder Steuerberatung)

---

## 1. Pakete & Konditionen (Monatlich, netto zzgl. 19 % MwSt.)

| Paket | Monatlicher Grundpreis | Kanäle & Umfang | Inklusivminuten | Mehrminutenpreis | Empfohlene Branchen |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Starter** | **89,00 € netto** *(105,91 € brutto)* | 1 Agent · Web-Assistent | 500 Min. | 0,18 €/Min. netto | Metzgerei (`butcher`), Gastronomie & Bäckerei (`gastronomy`) |
| **Professional** | **199,00 € netto** *(236,81 € brutto)* | 1 Agent · Web + Telefonie-Option | 1.500 Min. | 0,15 €/Min. netto | Handwerk (`trades`), KFZ-Werkstatt (`auto_repair`), Hausverwaltung (`property_management`) |
| **Kanzlei / Praxis (Elevated)** | **349,00 € netto** *(415,31 € brutto)* | 1 Agent · Elevated Privacy-Review inkl. · Web + Telefonie-Option | 1.200 Min. | 0,18 €/Min. netto | Rechtsanwaltskanzlei (`law_office`), Arzt- & Zahnarztpraxis (`medical_practice`), Steuerberatung (`tax_advisory`) |

> **Nächster Schritt zur Bereitstellung:** Verbindliche Einrichtung erfolgt über **„Angebot anfragen“**.

---

## 2. Die 8 Branchenvorlagen im Überblick

### A. Standard-Sensitivity Branchen (5 Vorlagen)

1. **Handwerk (`trades`)**
   - **Freigegebene Tools:** `lookup_kb`, `create_ticket`, `schedule_appointment`, `handoff_human`
   - **Zwingende Handoff-Trigger:** Akute Gefahr, Gasgeruch, Wasserrohrbruch, Stromausfall, Funkenflug, Reklamation
   - **Verbotene Zusagen:** Verbindliche Festpreiszusage ohne Vor-Ort-Prüfung, garantierte Sofortreparatur

2. **Metzgerei (`butcher`)**
   - **Freigegebene Tools:** `lookup_kb`, `create_ticket`, `handoff_human` *(kein `schedule_appointment`)*
   - **Zwingende Handoff-Trigger:** Schwere Allergie / Anaphylaxie, Reklamation, Catering-Sonderwunsch
   - **Verbotene Zusagen:** Verbindliche Allergie- oder Spurenfreiheitsgarantie

3. **KFZ-Werkstatt & Autohaus (`auto_repair`)**
   - **Freigegebene Tools:** `lookup_kb`, `create_ticket`, `schedule_appointment`, `handoff_human`
   - **Zwingende Handoff-Trigger:** Unfall, Panne, Bremsausfall, rote Warnleuchte, Rauchentwicklung, Reklamation
   - **Verbotene Zusagen:** Kostenvoranschlag ohne Diagnose, Weiterfahr-Freigabe bei Brems-/Lenkungsdefekt, garantierte HU/TÜV-Plakette

4. **Gastronomie & Bäckerei (`gastronomy`)**
   - **Freigegebene Tools:** `lookup_kb`, `create_ticket`, `schedule_appointment`, `handoff_human`
   - **Zwingende Handoff-Trigger:** Schwere Lebensmittelallergie / Zöliakie, Reklamation, Bankett / Gruppe ab 15 Personen
   - **Verbotene Zusagen:** 100 % Spuren-/Kreuzkontaminationsfreiheit, Exklusivbuchung ohne Bestätigung der Betriebsleitung

5. **Hausverwaltung & Immobilien (`property_management`)**
   - **Freigegebene Tools:** `lookup_kb`, `create_ticket`, `schedule_appointment`, `handoff_human`
   - **Zwingende Handoff-Trigger:** Rohrbruch, Wasserschaden, Heizungsausfall im Winter, Aufzugseinschluss, Mietrechtsstreit
   - **Verbotene Zusagen:** Zusage von Mietminderung oder Kostenübernahme, rechtsverbindliche Mietvertragszusage am Telefon

---

### B. Elevated-Sensitivity Branchen (3 Vorlagen – Dokumentierte Datenschutzprüfung Pflicht)

6. **Rechtsanwaltskanzlei (`law_office`)**
   - **Freigegebene Tools:** `lookup_kb`, `create_ticket`, `schedule_appointment`, `handoff_human`
   - **Zwingende Handoff-Trigger:** Fristsache, Kündigung, Eilrechtsschutz, Durchsuchung, Haftsache, Mandatskonflikt
   - **Verbotene Zusagen:** Rechtsberatung, Bestätigung einer Mandatsannahme, Aussage dass eine Frist geprüft oder gewahrt wurde

7. **Arzt- & Zahnarztpraxis (`medical_practice` – § 203 StGB)**
   - **Freigegebene Tools:** `lookup_kb`, `create_ticket`, `schedule_appointment`, `handoff_human`
   - **Zwingende Handoff-Trigger:** Atemnot, Brustschmerz, starke Blutung, akuter Schmerzfall, Fragen zu Labor-/Befundergebnissen
   - **Verbotene Zusagen:** Medizinische Diagnose oder Therapieempfehlung, Rezept-/AU-Zusage ohne ärztliche Prüfung, telefonische Befundherausgabe

8. **Steuerberatung & Wirtschaftsprüfung (`tax_advisory`)**
   - **Freigegebene Tools:** `lookup_kb`, `create_ticket`, `schedule_appointment`, `handoff_human`
   - **Zwingende Handoff-Trigger:** Ablaufende Finanzamt- oder Einspruchsfrist, Betriebsprüfung, Steuerfahndung, Kontopfändung
   - **Verbotene Zusagen:** Verbindliche Steuerberatung, Zusage einer Fristverlängerung beim Finanzamt, Mandatsannahme ohne Vertrag

---

## 3. Aktive Mandanten-Profile für Dominik Steiner (100 % Smoke-Test-Abdeckung)

Alle 8 Branchenprofile sind unter `/cursor/stores/store-8d5bca21-00e8-4084-a05f-43646dd48d75/vertical-voice-agent/tenants/` validiert und aktiv:
- `dominik-steiner-trades` (Handwerk · Professional · 3/3 Smoke-Tests bestanden)
- `dominik-steiner-butcher` (Metzgerei · Starter · 3/3 Smoke-Tests bestanden)
- `dominik-steiner-auto_repair` (KFZ-Werkstatt · Professional · 3/3 Smoke-Tests bestanden)
- `dominik-steiner-gastronomy` (Gastronomie & Bäckerei · Starter · 3/3 Smoke-Tests bestanden)
- `dominik-steiner-property_management` (Hausverwaltung · Professional · 3/3 Smoke-Tests bestanden)
- `dominik-steiner-law_office` (Rechtsanwaltskanzlei · Kanzlei · Elevated Privacy-Review OK · 3/3 Smoke-Tests bestanden)
- `dominik-steiner-medical_practice` (Arzt- & Zahnarztpraxis · Kanzlei · Elevated Privacy-Review OK · 3/3 Smoke-Tests bestanden)
- `dominik-steiner-tax_advisory` (Steuerberatung · Kanzlei · Elevated Privacy-Review OK · 3/3 Smoke-Tests bestanden)
