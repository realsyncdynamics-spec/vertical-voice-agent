// Tests für tools/onboarding-to-tenant.mjs — Aufruf: npm run test:onboarding
import { Miniflare } from "miniflare";
import { readFileSync } from "node:fs";
import { knownTemplates, toTenantSql, validateRecord } from "../tools/onboarding-to-tenant.mjs";

const results = [];
const ok = (name, cond, info = "") => results.push([cond ? "PASS" : "FAIL", name, info]);
const base = () => ({
  agent_id: "baeckerei-mueller-gastronomy", tenant_name: "Bäckerei Müller's", template: "gastronomy", valid: true,
  validation_errors: [], greeting: "Guten Tag, hier ist der KI-Assistent der Bäckerei Müller.", voice_id: "eve",
  compliance_flags: { ai_disclosure_enabled: true, telephony_approved: false, recording_enabled: false },
});

const tpl = knownTemplates();
ok("Vorlagen aus dem Seed gelesen", tpl.has("gastronomy") && tpl.has("trades") && tpl.size >= 8, [...tpl].join(","));
ok("gültige Konfig ohne Fehler", validateRecord(base(), { phone: "+4936791234" }).length === 0);
ok("valid=false wird abgelehnt", validateRecord({ ...base(), valid: false }).length > 0);
ok("offene Onboarding-Fehler werden abgelehnt", validateRecord({ ...base(), validation_errors: ["x"] }).length > 0);
ok("unbekannte Vorlage wird abgelehnt", validateRecord({ ...base(), template: "casino" }).length > 0);
ok("fehlende KI-Offenlegung wird abgelehnt", validateRecord({ ...base(), compliance_flags: { ai_disclosure_enabled: false } }).length > 0);
ok("Aufzeichnung ohne Freigabe wird abgelehnt",
  validateRecord({ ...base(), compliance_flags: { ai_disclosure_enabled: true, recording_enabled: true } }).length > 0);
ok("Rufnummer muss E.164 sein", validateRecord(base(), { phone: "036791234" }).length > 0);
ok("ungültige agent_id wird abgelehnt", validateRecord({ ...base(), agent_id: "Robert'); DROP TABLE tenants;--" }).length > 0);
ok("kein Objekt wird abgelehnt", validateRecord([]).length === 1);

const sql = toTenantSql(base(), { phone: "+4936791234", now: "2026-11-15T00:00:00Z" });
ok("SQL ist INSERT ohne OR REPLACE", sql.startsWith("INSERT INTO tenants") && !/OR REPLACE/.test(sql));
ok("telephony_approved bleibt false", sql.includes('"telephony_approved":false'));
ok("validation_errors nicht in den Daten", !sql.includes("validation_errors"));

// Ende-zu-Ende gegen eine lokale D1 mit Schema und Seed: Zeile landet, Apostroph bleibt intakt,
// zweites Einspielen scheitert statt still zu überschreiben.
const mf = new Miniflare({ modules: true, script: "export default { fetch() { return new Response('ok') } }", d1Databases: ["DB"] });
const db = await mf.getD1Database("DB");
for (const f of ["migrations/0001_init.sql", "migrations/0002_seed.sql"])
  for (const s of readFileSync(f, "utf8").split(/;\s*\n/).map((x) => x.replace(/^--.*$/gm, "").trim()).filter(Boolean)) await db.prepare(s).run();
const stmt = sql.trim().replace(/;$/, "");
await db.prepare(stmt).run();
const row = await db.prepare("SELECT phone_number, data FROM tenants WHERE agent_id=?").bind("baeckerei-mueller-gastronomy").first();
ok("Zeile in D1 angelegt", row?.phone_number === "+4936791234");
ok("Daten bleiben gültiges JSON mit Apostroph", JSON.parse(row?.data ?? "{}").tenant_name === "Bäckerei Müller's");
let dup = false;
try { await db.prepare(stmt).run(); } catch { dup = true; }
ok("zweites Einspielen scheitert (kein stilles Überschreiben)", dup);
await mf.dispose();

for (const [s, n, i] of results) console.log(`${s}  ${n}${i ? "  — " + i : ""}`);
const failed = results.filter((r) => r[0] === "FAIL").length;
console.log(`\n${results.length - failed}/${results.length} bestanden`);
process.exit(failed ? 1 : 0);
