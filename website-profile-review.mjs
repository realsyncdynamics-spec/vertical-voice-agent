import { validateProfile, confirmedBusinessName } from "./website-profile.mjs";

const LABELS = {business_name:"Unternehmensname",industry:"Branche",services:"Leistungen",opening_hours:"Öffnungszeiten",public_contact:"Öffentliche Kontaktdaten",faq:"Häufige Fragen"};

// Called by a future authorized transport; never fetches a URL or activates an agent.
export function mountProfileReview({root, websiteField, nameField, normalize, onChange}) {
  let generation = 0;
  function clear() {
    generation++;
    root.replaceChildren();
    root.hidden = true;
  }
  websiteField.addEventListener("input", clear);
  return {
    clear,
    show(payload, requestedOrigin) {
      clear();
      const origin = normalize(websiteField.value);
      const profile = origin === requestedOrigin ? validateProfile(payload, origin) : null;
      if (!profile) return false;
      const revision = generation;
      const doc = root.ownerDocument;
      const add = (parent, tag, value) => {
        const el = doc.createElement(tag);
        el.textContent = value;
        parent.append(el);
        return el;
      };
      add(root,"h3","Unternehmensinformationen prüfen");
      add(root,"p","Vorschläge aus Ihrer Website sind keine bestätigten Betriebsdaten. Prüfen Sie die Quelle.");
      if (!profile.candidates.length) add(root,"p","Keine Angaben gefunden. Bitte manuell fortfahren.");
      profile.candidates.forEach((candidate, index) => {
        const section = doc.createElement("section");
        section.className = "profile-candidate";
        root.append(section);
        add(section,"h4",LABELS[candidate.field]);
        add(section,"p",candidate.value);
        add(section,"p","Quelle: " + candidate.source_url);
        add(section,"p","Beleg: " + candidate.evidence);
        if (candidate.field !== "business_name" || !confirmedBusinessName(profile,index,true)) {
          add(section,"p","Nur zur Prüfung – bitte bei Bedarf manuell eintragen.");
          return;
        }
        const label = doc.createElement("label");
        const checkbox = doc.createElement("input");
        checkbox.type = "checkbox";
        label.append(checkbox,doc.createTextNode(" Unternehmensnamen geprüft"));
        section.append(label);
        const button = add(section,"button","Bestätigten Namen übernehmen");
        button.type = "button";
        button.className = "btn btn-secondary";
        button.disabled = true;
        checkbox.addEventListener("change",()=>{button.disabled=!checkbox.checked;});
        button.addEventListener("click",()=>{
          if (generation !== revision || normalize(websiteField.value) !== origin) return;
          const name = confirmedBusinessName(profile,index,checkbox.checked);
          if (!name) return;
          nameField.value = name;
          onChange();
          button.disabled = true;
          checkbox.disabled = true;
          button.textContent = "Übernommen";
        });
      });
      root.hidden = false;
      return true;
    }
  };
}
