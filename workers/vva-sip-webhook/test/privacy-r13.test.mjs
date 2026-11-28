// R13 – Datenminimierung und Aufbewahrung bei abgelehnten Anrufen ohne Mandanten.
// Isolierte Tests (Miniflare, DRY_RUN, kein Netz, kein PSTN). Aufruf: npm run test:r13
import { Miniflare } from "miniflare";
import { readFileSync } from "node:fs";
import { createHmac, randomUUID } from "node:crypto";
import * as core from "../src/core.js";

const SECRET_RAW = Buffer.from("test-signing-secret-0123456789").toString("base64");
const SECRET = "whsec_" + SECRET_RAW;
const CALLER = "+491701111111"; // Fixture-Nummer, keine echte Person
const results = []; const ok = (name, cond, info = "") => results.push([cond ? "PASS" : "FAIL", name, info]);
const sign = (body) => { const id = "msg_" + randomUUID(), ts = Math.floor(Date.now() / 1000);
  return { "webhook-id": id, "webhook-timestamp": String(ts), "content-type": "application/json",
    "webhook-signature": "v1," + createHmac("sha256", Buffer.from(SECRET_RAW, "base64")).update(`${id}.${ts}.${body}`).digest("base64") }; };
const evt = (call_id, to, from = CALLER) => JSON.stringify({ object: "event", id: "evt_" + call_id, type: "realtime.call.incoming", created_at: 1,
  data: { call_id, sip_headers: [{ name: "To", value: `<sip:${to}@x>` }, { name: "From", value: `<sip:${from}@x>` }] } });
const TENANT = (id, num) => ({ agent_id: id, tenant_name: id, template: "trades", effective_status: "active", valid: true, package: "professional",
  voice_id: "castor", enabled_tools: ["create_ticket", "schedule_appointment", "handoff_human"], handoff_number: "+4936790000", phone_number: num,
  compliance_flags: { ai_disclosure_enabled: true, telephony_approved: true }, telephony: { max_parallel_calls: 1, monthly_minute_budget: 0, max_call_minutes: 10, retention_days: 30 } });

async function make(bindings) {
  const mf = new Miniflare({ modules: true, scriptPath: "src/index.js", modulesRoot: ".", compatibilityDate: "2026-08-01",
    modulesRules: [{ type: "ESModule", include: ["**/*.js"] }], d1Databases: ["DB"],
    durableObjects: { CALLS: { className: "CallSession", useSQLite: true } },
    bindings: { SIGNATURE_TOLERANCE_SEC: "300", DRY_RUN: "true", XAI_WEBHOOK_SECRET: SECRET, ...bindings } });
  const db = await mf.getD1Database("DB");
  for (const f of ["migrations/0001_init.sql", "migrations/0002_seed.sql"])
    for (const s of readFileSync(f, "utf8").split(/;\s*\n/).map((x) => x.replace(/^--.*$/gm, "").trim()).filter(Boolean)) await db.prepare(s).run();
  const t = TENANT("t-limit", "+4936791234");
  await db.prepare("INSERT OR REPLACE INTO tenants VALUES (?,?,?,?,?)").bind(t.agent_id, t.template, t.phone_number, JSON.stringify(t), "x").run();
  const post = (body) => mf.dispatchFetch("http://x/xai/sip-webhook", { method: "POST", headers: sign(body), body }).then(async (r) => ({ s: r.status, j: await r.json() }));
  return { mf, db, post };
}
const row = (db, id) => db.prepare("SELECT agent_id, from_number, status, reject_reason FROM calls WHERE call_id=?").bind(id).first();
const ago = (days) => new Date(Date.now() - days * 864e5).toISOString();

// 1) Telefonie aus (heutiger Zustand): Anrufernummer wird nicht gespeichert
{
  const { mf, db, post } = await make({ TELEPHONY_ENABLED: "false", XAI_API_KEY: "dummy-not-a-key" });
  const r = await post(evt("r13-off", "+4936791234")); const c = await row(db, "r13-off");
  ok("Telefonie aus: abgelehnt", r.j.accepted === false && c?.reject_reason === "TELEPHONY_DISABLED", JSON.stringify(r.j));
  ok("Telefonie aus: keine Anrufernummer gespeichert (Negativtest)", c && c.from_number === null, JSON.stringify(c));
  const tr = (await db.prepare("SELECT COUNT(*) n FROM transcripts").first()).n;
  ok("Abgelehnter Anruf: keine Gesprächsinhalte gespeichert", tr === 0);
  const a = await db.prepare("SELECT args FROM call_actions WHERE call_id=?").bind("r13-off").first();
  ok("Protokoll enthält die Anrufernummer nicht", a && !String(a.args).includes(CALLER), a?.args);
  await mf.dispose();
}
// 2) Unbekannte Zielnummer: keine Anrufernummer
{
  const { mf, db, post } = await make({ TELEPHONY_ENABLED: "true", XAI_API_KEY: "dummy-not-a-key" });
  await post(evt("r13-unknown", "+4930000000")); const c = await row(db, "r13-unknown");
  ok("Unbekannte Nummer: UNKNOWN_NUMBER ohne Mandant", c?.reject_reason === "UNKNOWN_NUMBER" && c.agent_id === null, JSON.stringify(c));
  ok("Unbekannte Nummer: keine Anrufernummer gespeichert (Negativtest)", c && c.from_number === null);
  // 3) Bekannter Mandant, Budget 0 -> LIMIT: Nummer bleibt (Zweck: Rückruf), unterliegt Mandanten-Aufbewahrung
  await post(evt("r13-limit", "+4936791234")); const l = await row(db, "r13-limit");
  ok("Bekannter Mandant abgelehnt: Nummer bleibt für Rückruf (Regression)", l?.agent_id === "t-limit" && l.from_number === CALLER, JSON.stringify(l));

  // 4) Aufbewahrung: verwaiste Datensätze
  const ins = (id, agent, start, status = "rejected", from = null) => db.prepare("INSERT INTO calls (call_id, agent_id, from_number, status, started_at, month) VALUES (?,?,?,?,?,?)").bind(id, agent, from, status, start, start.slice(0, 7)).run();
  const act = (id, agent, at) => db.prepare("INSERT INTO call_actions (call_id, agent_id, action, decision, created_at) VALUES (?,?,?,?,?)").bind(id, agent, "x", "x", at).run();
  await ins("old-orphan", null, ago(8), "rejected", CALLER);   // Altbestand vor dem Fix
  await ins("new-orphan", null, ago(1));
  await ins("old-orphan-active", null, ago(8), "active");
  await ins("old-deleted-tenant", "t-geloescht", ago(8), "ended", CALLER);
  await ins("old-tenant-in-retention", "t-limit", ago(8), "ended", CALLER);
  await act("old-orphan", null, ago(8)); await act("new-orphan", null, ago(1)); await act("old-deleted-tenant", "t-geloescht", ago(8));
  await db.prepare("INSERT INTO transcripts (call_id, agent_id, role, text, created_at) VALUES (?,?,?,?,?)").bind("old-deleted-tenant", "t-geloescht", "user", "x", ago(8)).run();
  await db.prepare("INSERT INTO tasks (id, agent_id, call_id, kind, payload, status, created_at) VALUES (?,?,?,?,?,?,?)").bind("task-old", "t-geloescht", "old-deleted-tenant", "ticket", "{}", "offen", ago(8)).run();

  const n = await core.purge({ DB: db });
  const has = async (id) => Boolean(await row(db, id));
  ok("Purge: verwaister Anruf älter als 7 Tage gelöscht", !(await has("old-orphan")));
  ok("Purge: verwaister Anruf jünger als 7 Tage bleibt", await has("new-orphan"));
  // Review-Befund: 8 Tage "active" ist hängengeblieben, kein laufender Anruf (Schutz laufender Anrufe: Test 8).
  ok("Purge: hängender verwaister active-Anruf (8 Tage) geschlossen und entfernt", !(await has("old-orphan-active")));
  ok("Purge: Anruf eines gelöschten Mandanten gelöscht", !(await has("old-deleted-tenant")));
  ok("Purge: Anruf bestehenden Mandanten innerhalb seiner 30 Tage bleibt", await has("old-tenant-in-retention"));
  const cnt = async (sql) => (await db.prepare(sql).first()).n;
  ok("Purge: verwaiste Protokolle älter als 7 Tage gelöscht", await cnt("SELECT COUNT(*) n FROM call_actions WHERE call_id IN ('old-orphan','old-deleted-tenant')") === 0);
  ok("Purge: junges verwaistes Protokoll bleibt", await cnt("SELECT COUNT(*) n FROM call_actions WHERE call_id='new-orphan'") === 1);
  ok("Purge: Transkript und Aufgabe gelöschter Mandanten entfernt", await cnt("SELECT COUNT(*) n FROM transcripts") === 0 && await cnt("SELECT COUNT(*) n FROM tasks") === 0);
  ok("Purge meldet gelöschte Zeilen", n >= 6, String(n));
  await mf.dispose();
}

// 5) Fehlender xAI-Schlüssel: keine Anrufernummer
{
  const { mf, db, post } = await make({ TELEPHONY_ENABLED: "true" });
  await post(evt("r13-nokey", "+4936791234")); const c = await row(db, "r13-nokey");
  ok("Ohne xAI-Schlüssel: MISSING_XAI_API_KEY ohne Mandant", c?.reject_reason === "MISSING_XAI_API_KEY" && c.agent_id === null, JSON.stringify(c));
  ok("Ohne xAI-Schlüssel: keine Anrufernummer gespeichert (Negativtest)", c && c.from_number === null);
  await mf.dispose();
}
// 6) Ungültiger Mandant: Zuordnung besteht, Nummer bleibt (Rückruf) und unterliegt dessen Aufbewahrung
{
  const { mf, db, post } = await make({ TELEPHONY_ENABLED: "true", XAI_API_KEY: "dummy-not-a-key" });
  const t = { ...TENANT("t-ungueltig", "+4936795555"), compliance_flags: { ai_disclosure_enabled: false, telephony_approved: true } };
  await db.prepare("INSERT OR REPLACE INTO tenants VALUES (?,?,?,?,?)").bind(t.agent_id, t.template, t.phone_number, JSON.stringify(t), "x").run();
  await post(evt("r13-invalid", "+4936795555")); const c = await row(db, "r13-invalid");
  ok("Ungültiger Mandant: TENANT_INVALID mit Mandant", String(c?.reject_reason).startsWith("TENANT_INVALID") && c.agent_id === "t-ungueltig", JSON.stringify(c));
  ok("Ungültiger Mandant: Nummer bleibt für Rückruf (Regression)", c && c.from_number === CALLER);
  await mf.dispose();
}
// 7) Bestehender Mandant: Protokolle, Transkripte, Aufgaben nach 8 Tagen bleiben (30 Tage Aufbewahrung)
// 8) Hängengebliebene active-Anrufe werden geschlossen, laufende nicht; Parallel-Limit wieder frei
// 9) Fehlerhafter Mandanten-Datensatz bricht die Aufbewahrung nicht ab
{
  const { mf, db, post } = await make({ TELEPHONY_ENABLED: "true", XAI_API_KEY: "dummy-not-a-key" });
  const t2 = { ...TENANT("t-aktiv", "+4936797777"), telephony: { max_parallel_calls: 1, monthly_minute_budget: 10000, max_call_minutes: 10, retention_days: 30 } };
  await db.prepare("INSERT OR REPLACE INTO tenants VALUES (?,?,?,?,?)").bind(t2.agent_id, t2.template, t2.phone_number, JSON.stringify(t2), "x").run();
  await db.prepare("INSERT OR REPLACE INTO tenants VALUES (?,?,?,?,?)").bind("t-kaputt", "trades", "+4936798888", "{kein json", "x").run();
  const ins = (id, agent, start, status, reserved = 10) => db.prepare("INSERT INTO calls (call_id, agent_id, from_number, status, started_at, reserved_min, month) VALUES (?,?,?,?,?,?,?)").bind(id, agent, CALLER, status, start, reserved, start.slice(0, 7)).run();
  await ins("t-ended-8d", "t-aktiv", ago(8), "ended");
  await db.prepare("INSERT INTO call_actions (call_id, agent_id, action, decision, created_at) VALUES (?,?,?,?,?)").bind("t-ended-8d", "t-aktiv", "x", "x", ago(8)).run();
  await db.prepare("INSERT INTO transcripts (call_id, agent_id, role, text, created_at) VALUES (?,?,?,?,?)").bind("t-ended-8d", "t-aktiv", "user", "x", ago(8)).run();
  await db.prepare("INSERT INTO tasks (id, agent_id, call_id, kind, payload, status, created_at) VALUES (?,?,?,?,?,?,?)").bind("task-aktiv", "t-aktiv", "t-ended-8d", "ticket", "{}", "offen", ago(8)).run();
  await ins("stale-active", "t-aktiv", ago(1), "active");
  await ins("kaputt-alt", "t-kaputt", ago(40), "ended");
  await ins("orphan-alt", null, ago(8), "rejected");
  const before = await post(evt("r13-blocked", "+4936797777"));
  ok("Vor Purge: hängender Anruf blockiert Parallel-Limit (Ausgangslage)", before.j.accepted === false, JSON.stringify(before.j));
  let threw = null; try { await core.purge({ DB: db }); } catch (e) { threw = e; }
  ok("Purge bricht bei fehlerhaftem Mandanten-Datensatz nicht ab", threw === null, String(threw));
  ok("Purge: verwaister Anruf trotz fehlerhaftem Mandanten gelöscht", !(await row(db, "orphan-alt")));
  ok("Purge: fehlerhafter Mandant fällt auf Standard-Aufbewahrung (30 Tage) zurück", !(await row(db, "kaputt-alt")));
  const cnt = async (sql) => (await db.prepare(sql).first()).n;
  ok("Bestehender Mandant: Protokoll nach 8 Tagen bleibt (Negativtest)", await cnt("SELECT COUNT(*) n FROM call_actions WHERE call_id='t-ended-8d'") === 1);
  ok("Bestehender Mandant: Transkript nach 8 Tagen bleibt (Negativtest)", await cnt("SELECT COUNT(*) n FROM transcripts WHERE call_id='t-ended-8d'") === 1);
  ok("Bestehender Mandant: Aufgabe nach 8 Tagen bleibt (Negativtest)", await cnt("SELECT COUNT(*) n FROM tasks WHERE id='task-aktiv'") === 1);
  const st = await db.prepare("SELECT status, duration_sec, errors FROM calls WHERE call_id='stale-active'").first();
  ok("Hängender active-Anruf geschlossen, reservierte Dauer abgerechnet", st?.status === "ended" && st.duration_sec === 600 && st.errors === "STALE_ACTIVE_CLOSED", JSON.stringify(st));
  await ins("running", "t-aktiv", ago(10 / 1440), "active");
  await core.purge({ DB: db });
  ok("Laufender Anruf (10 min) bleibt active (Negativtest)", (await row(db, "running"))?.status === "active");
  await db.prepare("UPDATE calls SET status='ended' WHERE call_id='running'").run();
  const after = await post(evt("r13-free", "+4936797777"));
  ok("Nach Purge: Parallel-Limit wieder frei", after.j.accepted === true, JSON.stringify(after.j));
  await mf.dispose();
}

for (const [s, n, i] of results) console.log(`${s} - ${n} ${i && s === "FAIL" ? i : ""}`);
const fail = results.filter((r) => r[0] === "FAIL").length;
console.log(`\n${results.length - fail}/${results.length} bestanden`); process.exit(fail ? 1 : 0);
