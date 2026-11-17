#!/usr/bin/env node
/**
 * Mandanten-Einrichtung für die VVA-Telefonie (D1). Erzeugt nur SQL-Dateien, führt nichts aus.
 *
 *   node scripts/mandant.mjs pruefen  kunden/<datei>.json
 *   node scripts/mandant.mjs sql      kunden/<datei>.json   [--out kunden/<datei>.sql]
 *   node scripts/mandant.mjs anfragen <agent_id>             [--tage 7] [--out kunden/anfragen.sql]
 *
 * Fail-closed:
 *  - Die Prüfung nutzt denselben Validator wie der Worker (src/core.js validateTenant).
 *  - Telefonie wird nur freigegeben, wenn "telefonie_freigegeben": true UND ein AV-Vertragsdatum vorliegt.
 *  - Kanzlei/Praxis/Steuerberatung bleiben gesperrt, bis die Datenschutzprüfung dokumentiert ist.
 *  - Mit Fehlern (außer der bewusst noch fehlenden Telefonie-Freigabe) entsteht keine SQL-Datei.
 *
 * Kundendaten gehören NICHT ins Repo (öffentlich): Ordner `kunden/` ist per .gitignore ausgeschlossen.
 * Anwenden (nach Sichtprüfung der SQL-Datei):
 *   npx wrangler d1 execute vva_telephony_prod --env production --remote --file kunden/<datei>.sql
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateTenant, VOICES } from "../src/core.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const E164 = /^\+\d{8,15}$/;
const AGENT_ID = /^[a-z0-9][a-z0-9-]{2,62}$/;
const DATUM = /^\d{4}-\d{2}-\d{2}$/;

/** Pakete wie im Seed (migrations/0002_seed.sql). Preise netto, Kleinunternehmer § 19 UStG. */
export const PAKETE = {
  starter: { package_pricing_eur_net: 89, included_minutes: 500, overage_eur_per_min: 0.18 },
  professional: { package_pricing_eur_net: 199, included_minutes: 1500, overage_eur_per_min: 0.15 },
  kanzlei: { package_pricing_eur_net: 349, included_minutes: 1200, overage_eur_per_min: 0.18 },
};

/** Vorlagen aus der Seed-Migration lesen (eine Quelle der Wahrheit, keine Kopie). */
export function ladeVorlagen(seedPath = resolve(ROOT, "migrations/0002_seed.sql")) {
  const sql = readFileSync(seedPath, "utf8");
  const out = {};
  const re = /INSERT OR REPLACE INTO templates VALUES \('([^']+)','([^']+)','((?:[^']|'')*)'\);/g;
  for (const m of sql.matchAll(re)) out[m[1]] = { version: m[2], data: JSON.parse(m[3].replace(/''/g, "'")) };
  return out;
}

const q = (s) => "'" + String(s).replace(/'/g, "''") + "'";

/** Kundendatei -> Mandanten-Datensatz im Format des Workers. Gibt { t, fehler, hinweise } zurück. */
export function baueMandant(k, vorlagen, heute = new Date().toISOString()) {
  const fehler = [];
  const hinweise = [];
  const pflicht = ["agent_id", "firmenname", "vorlage", "paket", "rufnummer", "weiterleitung", "begruessung"];
  for (const f of pflicht) if (k[f] === undefined || k[f] === null || String(k[f]).trim() === "") fehler.push(`FEHLT:${f}`);

  if (k.agent_id && !AGENT_ID.test(k.agent_id)) fehler.push("AGENT_ID_FORMAT (a-z, 0-9, Bindestrich, 3–63 Zeichen)");
  if (k.agent_id && /^(dominik-steiner-|tenant-|vva-)/.test(k.agent_id)) fehler.push("AGENT_ID_RESERVIERT (Präfix der Demo-Mandanten)");
  const tpl = vorlagen[k.vorlage];
  if (k.vorlage && !tpl) fehler.push(`UNBEKANNTE_VORLAGE:${k.vorlage} (erlaubt: ${Object.keys(vorlagen).join(", ")})`);
  const paket = PAKETE[k.paket];
  if (k.paket && !paket) fehler.push(`UNBEKANNTES_PAKET:${k.paket} (erlaubt: ${Object.keys(PAKETE).join(", ")})`);
  if (k.rufnummer && !E164.test(k.rufnummer)) fehler.push("RUFNUMMER_NICHT_E164 (z. B. +4936701...)");
  if (k.weiterleitung && !E164.test(k.weiterleitung)) fehler.push("WEITERLEITUNG_NICHT_E164");
  if (k.rufnummer && k.rufnummer === k.weiterleitung) fehler.push("WEITERLEITUNG_GLEICH_RUFNUMMER (Schleife)");
  const stimme = String(k.stimme || "castor").toLowerCase();
  if (!VOICES.includes(stimme)) fehler.push(`UNBEKANNTE_STIMME:${stimme}`);

  const freigabe = k.telefonie_freigegeben === true;
  if (freigabe && !(typeof k.avv_unterzeichnet_am === "string" && DATUM.test(k.avv_unterzeichnet_am)))
    fehler.push("FREIGABE_OHNE_AV_VERTRAG (avv_unterzeichnet_am als JJJJ-MM-TT setzen)");

  const zahl = (v, def, min, max, name) => {
    const n = v === undefined ? def : Number(v);
    if (!Number.isInteger(n) || n < min || n > max) { fehler.push(`UNGUELTIG:${name} (${min}–${max})`); return def; }
    return n;
  };
  const telephony = {
    max_call_minutes: zahl(k.max_minuten_pro_anruf, 10, 1, 30, "max_minuten_pro_anruf"),
    monthly_minute_budget: zahl(k.minuten_pro_monat, paket?.included_minutes ?? 300, 0, 20000, "minuten_pro_monat"),
    max_parallel_calls: zahl(k.max_parallel, 2, 1, 10, "max_parallel"),
    retention_days: zahl(k.aufbewahrung_tage, 30, 1, 365, "aufbewahrung_tage"),
    transcript_enabled: k.abschrift === true,
  };
  if (telephony.transcript_enabled) hinweise.push("Abschrift ist aktiv: muss im AV-Vertrag (§ 2 Abs. 5) ausdrücklich vereinbart sein.");

  const faq = Array.isArray(k.faq) ? k.faq : [];
  for (const [i, f] of faq.entries()) if (!f?.frage || !f?.antwort) fehler.push(`FAQ_UNVOLLSTAENDIG:${i}`);
  if (faq.length > 8) hinweise.push("Mehr als 8 FAQ-Einträge: der Worker nutzt nur die ersten 8.");
  if (!k.oeffnungszeiten) hinweise.push("Keine Öffnungszeiten hinterlegt: Der Assistent bietet dann nur Rückruf an.");
  if (k.begruessung && !/\bKI\b|KI-/.test(k.begruessung)) hinweise.push("Begrüßung nennt keine KI: der Worker stellt automatisch einen KI-Hinweis voran.");

  const t = {
    agent_id: k.agent_id,
    tenant_name: k.firmenname,
    template: k.vorlage,
    package: k.paket,
    ...(paket || {}),
    channel: "telephony",
    requested_status: "active",
    effective_status: "active",
    valid: true,
    data_sensitivity: tpl?.data.data_sensitivity || "standard",
    enabled_tools: tpl?.data.allowed_tools || [],
    handoff_triggers: tpl?.data.handoff_triggers || [],
    forbidden_claims: tpl?.data.forbidden_claims || [],
    greeting: k.begruessung,
    handoff_number: k.weiterleitung,
    compliance_flags: {
      ai_disclosure_enabled: true,
      telephony_approved: freigabe && !fehler.some((f) => f.startsWith("FREIGABE_OHNE")),
      recording_enabled: false,
      recording_approved: false,
      retention_days: telephony.retention_days,
      privacy_review_documented: k.datenschutzpruefung_dokumentiert === true,
      avv_signed_on: k.avv_unterzeichnet_am || null,
    },
    telephony,
    voice_id: stimme,
    voice_engine: "grok_voice",
    opening_hours: k.oeffnungszeiten || null,
    faq,
    validation_errors: [],
    updated_at: heute,
  };

  // Gleicher Validator wie im Worker. TELEPHONY_NOT_APPROVED ist bei Vorbereitung erwartet (Hinweis, kein Fehler).
  const worker = tpl ? validateTenant(t, tpl.data) : [];
  for (const e of worker) {
    if (e === "TELEPHONY_NOT_APPROVED") hinweise.push("Telefonie noch NICHT freigegeben: Anrufe werden abgelehnt (fail-closed). Freigabe erst nach Testanruf und AV-Vertrag.");
    else if (e === "MISSING_PRIVACY_REVIEW_FOR_ELEVATED") fehler.push("DATENSCHUTZPRUEFUNG_FEHLT (Berufsgeheimnisträger: datenschutzpruefung_dokumentiert = true erst nach Prüfung)");
    else fehler.push(`WORKER:${e}`);
  }
  t.validation_errors = worker;
  return { t, fehler, hinweise };
}

export function mandantSql(t, rufnummer) {
  return [
    `-- Mandant ${t.agent_id} (${t.tenant_name}) · erzeugt ${t.updated_at}`,
    `-- Telefonie freigegeben: ${t.compliance_flags.telephony_approved ? "JA" : "NEIN (Anrufe werden abgelehnt)"}`,
    `INSERT OR REPLACE INTO tenants (agent_id, template, phone_number, data, updated_at) VALUES (${q(t.agent_id)}, ${q(t.template)}, ${q(rufnummer)}, ${q(JSON.stringify(t))}, ${q(t.updated_at)});`,
    "",
  ].join("\n");
}

export function anfragenSql(agentId, tage = 7) {
  if (!AGENT_ID.test(agentId)) throw new Error("agent_id ungültig");
  const n = Number.isInteger(tage) && tage > 0 && tage <= 365 ? tage : 7;
  return [
    `-- Offene und erledigte Anfragen der letzten ${n} Tage für ${agentId} (neueste zuerst)`,
    `SELECT created_at, kind, status, payload FROM tasks WHERE agent_id = ${q(agentId)} AND created_at >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-${n} days') ORDER BY created_at DESC;`,
    "",
  ].join("\n");
}

function arg(name) {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : undefined;
}

async function main() {
  const [cmd, ziel] = process.argv.slice(2);
  if (!cmd || !ziel) {
    console.log("Aufruf: node scripts/mandant.mjs pruefen|sql <kunde.json> | anfragen <agent_id> [--tage N] [--out datei.sql]");
    process.exit(2);
  }
  if (cmd === "anfragen") {
    const sql = anfragenSql(ziel, parseInt(arg("--tage") || "7", 10));
    const out = arg("--out");
    if (out) { writeFileSync(out, sql); console.log(`SQL geschrieben: ${out}\nAbfragen: npx wrangler d1 execute vva_telephony_prod --env production --remote --json --file ${out}`); }
    else console.log(sql);
    return;
  }
  const k = JSON.parse(readFileSync(ziel, "utf8"));
  const { t, fehler, hinweise } = baueMandant(k, ladeVorlagen());
  for (const h of hinweise) console.log("Hinweis:", h);
  if (fehler.length) {
    for (const f of fehler) console.error("FEHLER:", f);
    console.error(`\n${fehler.length} Fehler – keine SQL-Datei erzeugt.`);
    process.exit(1);
  }
  console.log(`OK: ${t.agent_id} · Vorlage ${t.template} · Paket ${t.package} · ${t.telephony.monthly_minute_budget} min/Monat · Aufbewahrung ${t.telephony.retention_days} Tage · Telefonie ${t.compliance_flags.telephony_approved ? "freigegeben" : "gesperrt"}`);
  if (cmd === "sql") {
    const out = arg("--out") || ziel.replace(/\.json$/, ".sql");
    writeFileSync(out, mandantSql(t, k.rufnummer));
    console.log(`SQL geschrieben: ${out}\nNach Sichtprüfung anwenden:\n  npx wrangler d1 execute vva_telephony_prod --env production --remote --file ${out}`);
  } else if (cmd !== "pruefen") {
    console.error(`Unbekannter Befehl: ${cmd}`); process.exit(2);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(e.message); process.exit(1); });
