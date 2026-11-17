// Tests für scripts/mandant.mjs – ohne Netz, ohne Abhängigkeiten: node test/mandant.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { baueMandant, ladeVorlagen, mandantSql, anfragenSql } from "../scripts/mandant.mjs";

const vorlagen = ladeVorlagen();
const basis = JSON.parse(readFileSync(new URL("../scripts/beispiel-kunde.json", import.meta.url), "utf8"));
const fix = "2026-11-17T22:00:00.000Z";
let n = 0;
const t = (name, fn) => { fn(); n++; console.log("ok -", name); };

t("liest alle 8 Vorlagen aus dem Seed", () => assert.equal(Object.keys(vorlagen).length, 8));

t("Beispiel: gültig, Telefonie gesperrt (fail-closed)", () => {
  const r = baueMandant(basis, vorlagen, fix);
  assert.deepEqual(r.fehler, []);
  assert.equal(r.t.compliance_flags.telephony_approved, false);
  assert.ok(r.hinweise.some((h) => h.includes("NICHT freigegeben")));
  assert.equal(r.t.telephony.monthly_minute_budget, 1500);
  assert.equal(r.t.handoff_number, basis.weiterleitung);
});

t("Freigabe ohne AV-Vertrag wird abgelehnt", () => {
  const r = baueMandant({ ...basis, telefonie_freigegeben: true }, vorlagen, fix);
  assert.ok(r.fehler.some((f) => f.startsWith("FREIGABE_OHNE_AV_VERTRAG")));
  assert.equal(r.t.compliance_flags.telephony_approved, false);
});

t("Freigabe mit AV-Vertrag: keine Fehler, freigegeben", () => {
  const r = baueMandant({ ...basis, telefonie_freigegeben: true, avv_unterzeichnet_am: "2026-11-20" }, vorlagen, fix);
  assert.deepEqual(r.fehler, []);
  assert.equal(r.t.compliance_flags.telephony_approved, true);
  assert.deepEqual(r.t.validation_errors, []);
});

t("Starter-Paket ist nur Web: Telefonie-Mandant abgelehnt", () => {
  const r = baueMandant({ ...basis, paket: "starter" }, vorlagen, fix);
  assert.ok(r.fehler.includes("WORKER:STARTER_PACKAGE_WEB_ONLY"));
});

t("Kanzlei ohne Datenschutzprüfung abgelehnt, mit Prüfung ok", () => {
  const ohne = baueMandant({ ...basis, vorlage: "law_office", paket: "kanzlei" }, vorlagen, fix);
  assert.ok(ohne.fehler.some((f) => f.startsWith("DATENSCHUTZPRUEFUNG_FEHLT")));
  const mit = baueMandant({ ...basis, vorlage: "law_office", paket: "kanzlei", datenschutzpruefung_dokumentiert: true }, vorlagen, fix);
  assert.deepEqual(mit.fehler, []);
});

t("Ungültige Nummern, Schleife, Stimme, Demo-Präfix", () => {
  const r = baueMandant({ ...basis, rufnummer: "036790000", weiterleitung: "036790000", stimme: "hal", agent_id: "tenant-x" }, vorlagen, fix);
  for (const f of ["RUFNUMMER_NICHT_E164", "WEITERLEITUNG_NICHT_E164", "UNBEKANNTE_STIMME", "AGENT_ID_RESERVIERT"])
    assert.ok(r.fehler.some((e) => e.startsWith(f)), f);
  const schleife = baueMandant({ ...basis, weiterleitung: basis.rufnummer }, vorlagen, fix);
  assert.ok(schleife.fehler.some((e) => e.startsWith("WEITERLEITUNG_GLEICH_RUFNUMMER")));
});

t("SQL maskiert Hochkommas und setzt die Rufnummer als Spalte", () => {
  const r = baueMandant({ ...basis, firmenname: "Müller's Bad & Heizung" }, vorlagen, fix);
  const sql = mandantSql(r.t, basis.rufnummer);
  assert.ok(sql.includes("Müller''s Bad"));
  assert.ok(sql.includes(`'${basis.rufnummer}'`));
  assert.ok(sql.includes("Telefonie freigegeben: NEIN"));
});

t("Anfragen-SQL: nur gültige agent_id", () => {
  assert.match(anfragenSql("kunde-shk-beispiel", 14), /-14 days/);
  assert.throws(() => anfragenSql("x'; DROP TABLE tasks;--"));
});

console.log(`\n${n}/${n} Tests bestanden`);
