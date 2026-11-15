// Onboarding-Konfig (.json aus onboarding.html) → geprüftes D1-SQL für einen Mandanten.
//
// Schreibt NICHTS in eine Datenbank. Ausgabe ist eine SQL-Zeile, die ein Mensch prüft und
// dann bewusst einspielt:
//   node tools/onboarding-to-tenant.mjs konfig.json --phone +4936791234 > tenant.sql
//   npx wrangler d1 execute vva_telephony_test --remote --file tenant.sql
//
// Fail-closed: Ungültige oder unvollständige Konfigurationen erzeugen kein SQL, sondern
// eine Fehlerliste (Exit 1). `telephony_approved` wird nie gesetzt oder hochgestuft — der
// Worker lehnt Anrufe ohne Freigabe weiterhin selbst ab.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const SEED = new URL("../migrations/0002_seed.sql", import.meta.url);

/** Vorlagen-Schlüssel, die der Worker kennt (aus dem Seed, nicht doppelt gepflegt). */
export function knownTemplates(seedSql = readFileSync(SEED, "utf8")) {
  return new Set([...seedSql.matchAll(/INSERT OR REPLACE INTO templates VALUES \('([a-z_]+)'/g)].map((m) => m[1]));
}

const E164 = /^\+[1-9]\d{6,14}$/;
const AGENT_ID = /^[a-z0-9][a-z0-9_-]{2,63}$/;
const sq = (s) => `'${String(s).replace(/'/g, "''")}'`;

export function validateRecord(rec, { phone = null, templates = knownTemplates() } = {}) {
  if (!rec || typeof rec !== "object" || Array.isArray(rec)) return ["Konfiguration ist kein JSON-Objekt."];
  const errors = [];
  const flags = rec.compliance_flags ?? {};
  if (!AGENT_ID.test(rec.agent_id ?? "")) errors.push("agent_id fehlt oder ist ungültig (a–z, 0–9, _ und -, 3–64 Zeichen).");
  if (!templates.has(rec.template)) errors.push(`Unbekannte Vorlage: ${JSON.stringify(rec.template)}.`);
  if (rec.valid !== true) errors.push("Onboarding meldet die Konfiguration als ungültig (valid !== true).");
  if (Array.isArray(rec.validation_errors) && rec.validation_errors.length) errors.push(`Offene Onboarding-Fehler: ${rec.validation_errors.join("; ")}`);
  if (flags.ai_disclosure_enabled !== true) errors.push("KI-Offenlegung in der Begrüßung ist nicht aktiviert.");
  if (flags.recording_enabled === true && flags.recording_approved !== true) errors.push("Aufzeichnung aktiv, aber nicht freigegeben.");
  if (typeof rec.greeting !== "string" || !rec.greeting.trim()) errors.push("Begrüßung fehlt.");
  if (phone !== null && !E164.test(phone)) errors.push(`Rufnummer ist nicht im E.164-Format: ${phone}`);
  return errors;
}

export function toTenantSql(rec, { phone = null, now = new Date().toISOString() } = {}) {
  const data = { ...rec, ...(phone ? { phone_number: phone } : {}) };
  delete data.validation_errors;
  // Bewusst INSERT ohne OR REPLACE: Ein bestehender Mandant wird nie still überschrieben.
  return `INSERT INTO tenants (agent_id, template, phone_number, data, updated_at) VALUES (${sq(rec.agent_id)}, ${sq(rec.template)}, ${phone ? sq(phone) : "NULL"}, ${sq(JSON.stringify(data))}, ${sq(now)});\n`;
}

function main(argv) {
  const pi = argv.indexOf("--phone");
  const phone = pi >= 0 ? (argv[pi + 1] ?? "") : null;
  const file = argv.find((a, i) => !a.startsWith("--") && !(pi >= 0 && i === pi + 1));
  if (!file) {
    console.error("Aufruf: node tools/onboarding-to-tenant.mjs <konfig.json> [--phone +49…]");
    return 2;
  }
  let rec;
  try {
    rec = JSON.parse(readFileSync(file, "utf8"));
  } catch (e) {
    console.error(`Datei nicht lesbar oder kein JSON: ${e.message}`);
    return 1;
  }
  const errors = validateRecord(rec, { phone });
  if (errors.length) {
    console.error("Kein SQL erzeugt:\n- " + errors.join("\n- "));
    return 1;
  }
  process.stdout.write(toTenantSql(rec, { phone }));
  if (rec.compliance_flags?.telephony_approved !== true) {
    console.error("Hinweis: telephony_approved ist nicht gesetzt — der Worker nimmt für diesen Mandanten keine Anrufe an.");
  }
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) process.exit(main(process.argv.slice(2)));
