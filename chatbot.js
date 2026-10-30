/* Vertical Voice Agent – Hilfe-Chatbot (offline, regel- & FAQ-basiert, keine externe API, keine Daten werden gesendet) */
(function () {
  const FAQ = [
    { k: ["preis","kosten","paket","pakete","starter","professional","kanzlei","praxis","euro","€","monat","mwst"],
      a: "Es gibt drei Pakete (monatlich, netto zzgl. 19 % MwSt.): Starter 89 € (nur Web, 500 Minuten inklusive, danach 0,18 € pro Minute), Professional 199 € (Web plus Telefonie-Option, 1.500 Minuten, danach 0,15 €) und Kanzlei / Praxis 349 € (Web plus Telefonie-Option, Datenschutzprüfung inklusive, 1.200 Minuten, danach 0,18 €). Je Paket 1 Agent." },
    { k: ["minute","minuten","inklusiv","mehrminuten","folgepreis","überschreit"],
      a: "Inklusivminuten: Starter 500, Professional 1.500, Kanzlei / Praxis 1.200 pro Monat. Jede weitere Minute kostet netto 0,18 € (Starter), 0,15 € (Professional) bzw. 0,18 € (Kanzlei / Praxis). Den Minutenrechner finden Sie auf der Startseite unter „Minutenrechner“." },
    { k: ["branche","branchen","vorlage","handwerk","metzgerei","kfz","werkstatt","gastronomie","bäckerei","hausverwaltung","kanzlei","arzt","zahnarzt","steuer"],
      a: "Es gibt 8 Branchenvorlagen: Handwerk, Metzgerei, KFZ-Werkstatt & Autohaus, Gastronomie & Bäckerei, Hausverwaltung (Sensibilität standard) sowie Rechtsanwaltskanzlei, Arzt- & Zahnarztpraxis und Steuerberatung (erhöhte Sensibilität – Aktivierung nur nach dokumentierter Datenschutzprüfung)." },
    { k: ["metzgerei","metzger","fleischer"],
      a: "In der Vorlage Metzgerei ist keine Terminbuchung freigegeben. Terminwünsche werden als Rückruf-Ticket erfasst. Bei Allergiefragen übergibt der Assistent an Ihr Fachpersonal und gibt keine Allergie- oder Spurenfreiheitsgarantie." },
    { k: ["kalender","google","outlook","calendar"],
      a: "Sie wählen beim Onboarding Ihren Kalender: Google Kalender ist empfohlen (Standard). Outlook ist eine unterstützte Alternative – Hinweis: Bei Outlook kann es zu Verbindungsproblemen kommen, und Termine lassen sich über die Anbindung derzeit nicht löschen (ggf. selbst in Outlook entfernen). Bei Outlook wird immer in den Kalender des verbundenen Kontos gebucht." },
    { k: ["zielkalender","calendar_id","bestimmter kalender","welcher kalender"],
      a: "Optional können Sie einen Zielkalender als E-Mail-Adresse angeben. Ohne Angabe wird der Hauptkalender des verbundenen Kontos genutzt. Bei Outlook muss der Zielkalender dem eigenen Postfach entsprechen." },
    { k: ["termin","buchung","buchen","terminbuchung","frei","belegt","doppelt"],
      a: "Ein Termin wird nur eingetragen, wenn alles passt: Betrieb freigeschaltet, Terminbuchung in der Branche erlaubt, Termin innerhalb der Öffnungszeiten, kein Feiertag oder Betriebsferientag, Zeitraum im Kalender frei – und direkt vor dem Eintragen wird noch einmal geprüft (höchstens 5 Minuten alt). Sonst wird nicht gebucht und der Anrufer bekommt einen anderen Termin oder einen Rückruf angeboten." },
    { k: ["öffnungszeit","öffnungszeiten","geschäftszeit","uhrzeit","wochenende","samstag","sonntag"],
      a: "Termine nur innerhalb Ihrer Öffnungszeiten (Zeitzone Europe/Berlin). Wenn Sie nichts eintragen, gilt Montag bis Freitag 08:00–18:00, Samstag und Sonntag geschlossen. Im Onboarding (Schritt 3) können Sie eigene Zeiten pro Tag eintragen." },
    { k: ["feiertag","feiertage","betriebsferien","urlaub","schließtag","geschlossen","bundesland"],
      a: "Gesetzliche Feiertage können Sie pro Bundesland automatisch sperren lassen (Standard Thüringen, wenn aktiviert). Zusätzlich tragen Sie einzelne Schließtage und Betriebsferien ein. Ohne Eintrag wird nichts gesperrt – dann gelten nur die Öffnungszeiten." },
    { k: ["fail","closed","sicherheit","gesperrt","pausiert","freigabe","validierung"],
      a: "Fail-Closed heißt: Der Assistent wird nur aktiv, wenn alle Pflichtfreigaben vorliegen. Fehlt etwas (z. B. KI-Offenlegung, Telefonie-Freigabe, Datenschutzprüfung bei sensiblen Branchen, Aufbewahrungsfrist bei Aufzeichnung), wird er pausiert und alle Werkzeuge sind gesperrt." },
    { k: ["ki","offenlegung","kennzeichnung","ki-assistent","transparenz"],
      a: "Der Assistent sagt in jeder Begrüßung, dass ein KI-Assistent spricht. Ohne diese KI-Offenlegung ist keine Aktivierung möglich." },
    { k: ["telefon","telefonie","anruf","rufnummer"],
      a: "Telefonie gibt es ab Paket Professional und nur mit ausdrücklicher Telefonie-Freigabe (Häkchen im Onboarding, Schritt 4). Starter ist reiner Web-Sprachassistent." },
    { k: ["aufzeichnung","aufnahme","transkript","recording","speicher","aufbewahrung"],
      a: "Aufzeichnung oder Transkript-Speicherung nur mit ausdrücklicher Freigabe und einer festgelegten Aufbewahrungsfrist in Tagen. Sonst greift die Fail-Closed-Sperre." },
    { k: ["datenschutz","dsgvo","privacy","datenschutzprüfung","elevated","sensibel"],
      a: "Für Kanzlei, Arzt- & Zahnarztpraxis und Steuerberatung ist eine dokumentierte Datenschutzprüfung Pflicht, bevor der Assistent aktiv wird. Eine garantierte Compliance-Zusage geben wir nicht." },
    { k: ["onboarding","einrichten","einrichtung","starten","anleitung","klick","schritt","wie geht"],
      a: "Self-Service in 6 Schritten auf der Onboarding-Seite: 1. Branche wählen, 2. Betriebsdaten, Paket, Kanal und Kalender, 3. Öffnungszeiten, Feiertage, Betriebsferien, 4. Freigaben (KI-Offenlegung, Telefonie, Datenschutz), 5. Live-Status und Testgespräche prüfen, 6. Konfiguration und Protokoll herunterladen. Die Klickanleitung finden Sie unter anleitung.html." },
    { k: ["json","konfig","konfiguration","download","herunterladen","protokoll","datei"],
      a: "Im letzten Schritt laden Sie die Konfiguration (.json) und das Onboarding-Protokoll (.md) herunter. Die Konfiguration enthält alle Ihre Einstellungen inklusive Kalender, Öffnungszeiten und Schließtagen – ohne Passwörter oder Zugangsdaten." },
    { k: ["angebot","anfrage","anfragen","vertrag"],
      a: "Eine Angebotsanfrage ist nicht nötig – Sie können alles selbst im Onboarding einrichten. Wer ein schriftliches Angebot möchte, kann es optional auf der Startseite unter „Angebot anfragen“ erzeugen." },
    { k: ["anbieter","impressum","wer","kontakt","firma","steiner"],
      a: "Anbieter: Dominik Steiner, Einzelunternehmen, Schwarzburger Str. 31, 98724 Neuhaus am Rennweg (Thüringen). Der Vertical Voice Agent ist ein eigenständiges Produkt außerhalb von RealSyncDynamics.AI. Kontakt: realsyncdynamics@gmail.com." },
    { k: ["stimme","stimmen","voice","grok","sprecher"],
      a: "Sie wählen im Onboarding eine von 28 Grok-Stimmen (alle sprechen Deutsch, Standard: eve). Empfohlen für Betriebe: castor, atlas, celeste, ursa, rigel, lux, ara, rex, sal; für Kanzlei/Praxis/Steuerberatung: lux, liora, aurora, celeste. Die Hörbeispiele auf der Website sind echte Grok-Stimmen." },
    { k: ["telefon","anruf","rückruf","ticket"],
      a: "Der Telefonassistent führt echte Gespräche: KI-Hinweis, Anliegen erfragen, Angaben nachfragen, Zusammenfassung bestätigen – dann Termin buchen (wo freigegeben, nach Öffnungszeiten-/Kalenderprüfung) oder Rückruf-Ticket anlegen. Notfälle und kritische Stichworte gehen sofort an Ihr Team." },
    { k: ["pitch","deck","präsentation","produktmappe","unterlagen"],
      a: "Unterlagen: Produktmappe (produktmappe.html) und Vertriebs-Pitch-Deck (vertical-voice-agent-pitch-deck.pptx) – beide auf der Startseite verlinkt." },
    { k: ["übergabe","mitarbeiter","mensch","handoff","weiterleiten"],
      a: "Bei kritischen Stichworten (z. B. Gasgeruch, Rohrbruch, Allergie, Fristsache, medizinischer Notfall) übergibt der Assistent sofort an Ihr Team. Den Übergabe-Kontakt tragen Sie im Onboarding in Schritt 2 ein." }
  ];
  const DANGER = ["notfall","gasgeruch","gas riecht","brand","feuer","rohrbruch","atemnot","brustschmerz","blutung","bewusstlos","unfall","lebensgefahr","suizid"];
  const ADVICE = ["rechtsberatung","rechtlich","klage","anwalt","frist","einspruch","kündigung","diagnose","medikament","krankschreibung","symptom","steuerberatung","steuern sparen","finanzamt","steuererklärung","vertrag prüfen","haftung"];
  const GUARANTEE = ["garantie","garantiert","dsgvo-konform garant","100 %","100%","rechtssicher"];
  const SUGGEST = ["Was kosten die Pakete?","Wie funktioniert das Onboarding?","Google oder Outlook?","Wann wird ein Termin gebucht?","Was heißt Fail-Closed?"];

  function norm(s){return s.toLowerCase().replace(/[^a-zäöüß0-9€% -]/g," ");}
  function answer(q){
    const t = norm(q);
    if (DANGER.some(w=>t.includes(w)))
      return "Bei akuter Gefahr oder einem Notfall wählen Sie bitte sofort den Notruf 112 (Feuerwehr/Rettungsdienst) bzw. 110 (Polizei) oder den zuständigen Notdienst. Ich bin nur ein Hilfe-Bot für dieses Produkt.";
    if (ADVICE.some(w=>t.includes(w)))
      return "Dazu kann ich keine Rechts-, Medizin- oder Steuerberatung geben und keine Fristen prüfen. Bitte wenden Sie sich an eine zugelassene Fachperson. Bei Fragen zum Produkt schreiben Sie an realsyncdynamics@gmail.com.";
    let best=null, score=0;
    for (const f of FAQ){ let s=0; for (const k of f.k) if (t.includes(k)) s += k.length>4?2:1; if (s>score){score=s;best=f;} }
    let out = best && score>0 ? best.a : "Dazu habe ich keine gesicherte Information. Ich beantworte Fragen zu Paketen, Preisen, Branchen, Onboarding, Kalender, Terminbuchung und Sicherheit. Für alles andere: realsyncdynamics@gmail.com.";
    if (GUARANTEE.some(w=>t.includes(w))) out = "Hinweis: Wir geben keine garantierte Compliance- oder Erfolgszusage. " + out;
    return out;
  }
  function el(tag, css, html){const e=document.createElement(tag); if(css) e.style.cssText=css; if(html!==undefined) e.innerHTML=html; return e;}
  function esc(s){return s.replace(/[&<>]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;"}[c]));}
  function init(){
    const btn = el("button","position:fixed;right:20px;bottom:20px;z-index:9999;border:none;border-radius:999px;padding:14px 18px;font-weight:600;cursor:pointer;color:#fff;background:linear-gradient(135deg,#38bdf8,#0284c7);box-shadow:0 8px 24px rgba(0,0,0,.4);font-family:inherit","💬 Fragen? Hilfe-Bot");
    btn.id="vva-chat-button"; btn.setAttribute("aria-label","Hilfe-Chat öffnen");
    const box = el("div","position:fixed;right:20px;bottom:80px;z-index:9999;width:min(380px,calc(100vw - 40px));height:min(520px,calc(100vh - 120px));display:none;flex-direction:column;background:#111827;color:#e5e7eb;border:1px solid #334155;border-radius:14px;box-shadow:0 12px 40px rgba(0,0,0,.5);font-family:inherit;font-size:14px;overflow:hidden");
    box.id="vva-chatbot";
    box.innerHTML = '<div style="padding:12px 14px;background:#1e293b;display:flex;justify-content:space-between;align-items:center"><strong>Hilfe-Bot · Vertical Voice Agent</strong><button id="vva-x" style="background:none;border:none;color:#94a3b8;font-size:18px;cursor:pointer" aria-label="Schließen">×</button></div>'
      + '<div id="vva-log" style="flex:1;overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:8px"></div>'
      + '<div id="vva-sugg" style="padding:0 12px 8px;display:flex;flex-wrap:wrap;gap:6px"></div>'
      + '<form id="vva-form" style="display:flex;gap:6px;padding:10px;border-top:1px solid #334155"><input id="vva-in" autocomplete="off" placeholder="Ihre Frage …" style="flex:1;padding:9px;border-radius:8px;border:1px solid #334155;background:#0b0f19;color:#e5e7eb"/><button style="padding:9px 12px;border:none;border-radius:8px;background:#0284c7;color:#fff;cursor:pointer">Senden</button></form>'
      + '<div style="padding:6px 12px 10px;font-size:11px;color:#94a3b8">Automatischer Hilfe-Bot (kein Mensch, keine KI-Cloud, Ihre Eingaben verlassen den Browser nicht). Keine Rechts-, Medizin- oder Steuerberatung.</div>';
    document.body.appendChild(btn); document.body.appendChild(box);
    const log=box.querySelector("#vva-log");
    function add(text, me){ const m=el("div", "max-width:88%;padding:8px 11px;border-radius:10px;line-height:1.4;"+(me?"align-self:flex-end;background:#0284c7;color:#fff":"align-self:flex-start;background:#1e293b"), esc(text)); log.appendChild(m); log.scrollTop=log.scrollHeight; }
    function ask(q){ if(!q.trim()) return; add(q,true); setTimeout(()=>add(answer(q)),150); }
    const sg=box.querySelector("#vva-sugg");
    SUGGEST.forEach(s=>{const b=el("button","border:1px solid #334155;background:#0b0f19;color:#cbd5e1;border-radius:999px;padding:4px 9px;font-size:12px;cursor:pointer",esc(s)); b.type="button"; b.onclick=()=>ask(s); sg.appendChild(b);});
    add("Hallo! Ich bin der automatische Hilfe-Bot. Fragen Sie mich jederzeit zu Paketen, Onboarding, Kalender, Terminbuchung oder Sicherheit.");
    btn.onclick=()=>{box.style.display = box.style.display==="flex"?"none":"flex"; if(box.style.display==="flex") box.querySelector("#vva-in").focus();};
    box.querySelector("#vva-x").onclick=()=>box.style.display="none";
    box.querySelector("#vva-form").onsubmit=e=>{e.preventDefault(); const i=box.querySelector("#vva-in"); ask(i.value); i.value="";};
    window.vvaChatAnswer = answer; window.vvaChatOpen = ()=>{box.style.display="flex";};
  }
  if (document.readyState==="loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
