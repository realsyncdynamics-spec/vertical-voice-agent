import { validateProfile, confirmedBusinessName } from "./website-profile.mjs";

const LABELS = {business_name:"Unternehmensname",industry:"Branche",services:"Leistungen",opening_hours:"Öffnungszeiten",public_contact:"Öffentliche Kontaktdaten",faq:"Häufige Fragen"};

// Only explicit customer decisions enter the local draft. No runtime permissions.
export function mountProfileReview({root, websiteField, nameField, normalize, onChange}) {
  let generation = 0;
  let accepted = new Map();
  let importedName = null;
  let activeOrigin = null;
  function publish() {
    onChange(activeOrigin && accepted.size ? {source_origin:activeOrigin,candidates:[...accepted.values()]} : null);
  }
  function clear() {
    generation++;
    if (importedName !== null && nameField.value === importedName) nameField.value = "";
    importedName = null;
    accepted = new Map();
    activeOrigin = null;
    root.replaceChildren();
    root.hidden = true;
    publish();
  }
  websiteField.addEventListener("input", clear);
  nameField.addEventListener("input",()=>{
    if(importedName !== null && nameField.value !== importedName){
      importedName=null;
      for(const [key,c] of accepted) if(c.field==="business_name") accepted.delete(key);
      publish();
    }
  });
  return {
    clear,
    show(payload, requestedOrigin) {
      clear();
      const origin = normalize(websiteField.value);
      const profile = origin === requestedOrigin ? validateProfile(payload, origin) : null;
      if (!profile) return false;
      activeOrigin = origin;
      const revision = generation;
      const doc = root.ownerDocument;
      const add = (parent, tag, value) => {
        const el = doc.createElement(tag);
        el.textContent = value;
        parent.append(el);
        return el;
      };
      add(root,"h3","Unternehmensinformationen prüfen");
      add(root,"p","Bitte bestätigen Sie nur richtige Angaben. Öffnungszeiten, Branche und Übergabekontakt des Assistenten bleiben separat einzustellen.");
      if (!profile.candidates.length) add(root,"p","Keine Angaben gefunden. Bitte manuell fortfahren.");
      profile.candidates.forEach((candidate, index) => {
        const section = doc.createElement("section");
        section.className = "profile-candidate";
        root.append(section);
        add(section,"h4",LABELS[candidate.field]);
        add(section,"p",candidate.value);
        add(section,"p","Quelle: " + candidate.source_url);
        add(section,"p","Beleg: " + candidate.evidence);
        const label = doc.createElement("label");
        const checkbox = doc.createElement("input");
        checkbox.type = "checkbox";
        label.append(checkbox,doc.createTextNode(" Angabe geprüft"));
        section.append(label);
        const button = add(section,"button","Bestätigte Angabe übernehmen");
        button.type = "button";
        button.className = "btn btn-secondary";
        button.disabled = true;
        const undo = add(section,"button","Übernahme widerrufen");
        undo.type = "button";
        undo.className = "btn btn-secondary";
        undo.hidden = true;
        checkbox.addEventListener("change",()=>{button.disabled=!checkbox.checked;});
        button.addEventListener("click",()=>{
          if (generation !== revision || normalize(websiteField.value) !== origin || !checkbox.checked) return;
          if(candidate.field==="business_name"){
            const name=confirmedBusinessName(profile,index,true);
            if(!name) return;
            // One confirmed company name, do not silently overwrite manually entered data.
            if(nameField.value.trim() && nameField.value!==name && nameField.value!==importedName){
              add(section,"p","Bitte korrigieren oder leeren Sie zuerst den Betriebsnamen manuell.");
              return;
            }
            for(const [key,c] of accepted) if(c.field==="business_name") accepted.delete(key);
            importedName=name;
            nameField.value=name;
          }
          accepted.set(index,{...candidate,observed_at:profile.observed_at});
          publish();
          button.disabled=true;
          checkbox.disabled=true;
          button.textContent="Übernommen";
          undo.hidden=false;
        });
        undo.addEventListener("click",()=>{
          if(generation!==revision) return;
          if(candidate.field==="business_name" && accepted.has(index)){
            if(nameField.value===importedName) nameField.value="";
            importedName=null;
          }
          accepted.delete(index);
          publish();
          checkbox.checked=false;checkbox.disabled=false;
          button.disabled=true;button.textContent="Bestätigte Angabe übernehmen";undo.hidden=true;
        });
      });
      root.hidden = false;
      return true;
    }
  };
}
