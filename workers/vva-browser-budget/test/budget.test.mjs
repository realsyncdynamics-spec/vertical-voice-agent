import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Miniflare } from "miniflare";
import { reserveBrowserBudget, settleBrowserBudget } from "../src/budget.js";

async function setup(t, { daily = 100, monthly = 100, session = 100, tenantMonthly = 100, tenantSession = 100 } = {}) {
  const mf = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('test'); } }",
    compatibilityDate: "2026-08-01",
    d1Databases: ["BROWSER_DB"],
  });
  t.after(() => mf.dispose());
  const db = await mf.getD1Database("BROWSER_DB");
  const migration = await readFile(new URL("../migrations/0001_browser_budget.sql", import.meta.url), "utf8");
  for (const statement of migration.split(/;\s*(?:\n|$)/).map((s) => s.trim()).filter(Boolean)) {
    await db.prepare(statement).run();
  }
  await db.prepare("INSERT INTO browser_budget_global VALUES (1, 'EUR', ?, ?, ?)")
    .bind(daily, monthly, session).run();
  for (const tenant of ["a", "b"]) {
    await db.prepare("INSERT INTO browser_budget_tenants VALUES (?, ?, ?)")
      .bind(tenant, tenantMonthly, tenantSession).run();
  }
  return db;
}

const reserve = (db, sessionId, tenantId = "a", amountMicros = 60) =>
  reserveBrowserBudget(db, { sessionId, tenantId, amountMicros });
const settle = (db, sessionId, tenantId = "a", actualMicros = 20) =>
  settleBrowserBudget(db, { sessionId, tenantId, actualMicros });

test("parallel requests cannot exceed global daily, global monthly or tenant monthly budgets", async (t) => {
  for (const [limits, secondTenant] of [
    [{ daily: 100, monthly: 500, tenantMonthly: 500 }, "b"],
    [{ daily: 500, monthly: 100, tenantMonthly: 500 }, "b"],
    [{ daily: 500, monthly: 500, tenantMonthly: 100 }, "a"],
  ]) {
    const db = await setup(t, limits);
    const results = await Promise.all([reserve(db, "one", "a"), reserve(db, "two", secondTenant)]);
    assert.equal(results.filter((r) => r.created).length, 1);
    assert.equal(results.find((r) => !r.created).reason, "BUDGET_UNAVAILABLE_OR_LIMIT_REACHED");
    assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM browser_budget_sessions").first()).n, 1);
  }
});

test("global daily and monthly limits and tenant monthly limits are independent", async (t) => {
  for (const limits of [
    { daily: 99, monthly: 500, tenantMonthly: 500 },
    { daily: 500, monthly: 99, tenantMonthly: 500 },
    { daily: 500, monthly: 500, tenantMonthly: 99 },
  ]) {
    const db = await setup(t, limits);
    assert.deepEqual(await reserve(db, "one"), { created: true });
    assert.equal((await reserve(db, "two", "a", 40)).reason, "BUDGET_UNAVAILABLE_OR_LIMIT_REACHED");
  }
  const db = await setup(t, { daily: 500, monthly: 500, tenantMonthly: 60 });
  assert.equal((await reserve(db, "one", "a")).created, true);
  assert.equal((await reserve(db, "two", "b")).created, true);
  assert.equal((await reserve(db, "three", "a", 1)).created, false);
});

test("each configured session limit and exact budget boundary is enforced", async (t) => {
  for (const limits of [{ session: 59 }, { tenantSession: 59 }]) {
    const db = await setup(t, limits);
    assert.equal((await reserve(db, "one")).created, false);
  }
  const db = await setup(t, { daily: 60, monthly: 60, session: 60, tenantMonthly: 60, tenantSession: 60 });
  assert.equal((await reserve(db, "one")).created, true);
  assert.equal((await reserve(db, "two", "a", 1)).created, false);
});

test("missing configuration, zero limits and currency changes fail closed", async (t) => {
  const db = await setup(t);
  await db.prepare("DELETE FROM browser_budget_tenants WHERE tenant_id = 'a'").run();
  assert.equal((await reserve(db, "missing-tenant")).created, false);
  await db.prepare("DELETE FROM browser_budget_global").run();
  assert.equal((await reserve(db, "missing-global", "b")).created, false);
  await db.prepare("INSERT INTO browser_budget_global VALUES (1, 'EUR', 0, 100, 100)").run();
  assert.equal((await reserve(db, "zero", "b")).created, false);
  await db.prepare("UPDATE browser_budget_global SET daily_limit_micros = 100").run();
  assert.equal((await reserve(db, "first", "b")).created, true);
  await db.prepare("UPDATE browser_budget_global SET currency = 'USD'").run();
  assert.equal((await reserve(db, "changed", "b", 1)).created, false);
});

test("retries never authorize another provider session; conflicting IDs fail", async (t) => {
  const db = await setup(t, { daily: 1000, monthly: 1000, tenantMonthly: 1000 });
  const results = await Promise.all(Array.from({ length: 10 }, () => reserve(db, "same")));
  assert.equal(results.filter((r) => r.created).length, 1);
  assert.equal(results.filter((r) => r.reason === "ALREADY_RESERVED").length, 9);
  assert.equal((await reserve(db, "same", "b")).reason, "IDEMPOTENCY_CONFLICT");
  assert.equal((await reserve(db, "same", "a", 61)).reason, "IDEMPOTENCY_CONFLICT");
  assert.equal((await settle(db, "same")).settled, true);
  assert.equal((await reserve(db, "same")).reason, "ALREADY_RESERVED");
});

test("settlement is tenant-bound, idempotent and frees only the final unused amount", async (t) => {
  const db = await setup(t);
  assert.equal((await reserve(db, "one")).created, true);
  assert.equal((await settle(db, "one", "b")).reason, "NOT_FOUND");
  assert.equal((await reserve(db, "two", "a", 41)).created, false);
  assert.equal((await settle(db, "one", "a", 20)).settled, true);
  assert.equal((await settle(db, "one", "a", 20)).reason, "ALREADY_SETTLED");
  assert.equal((await settle(db, "one", "a", 19)).reason, "SETTLEMENT_CONFLICT");
  assert.equal((await reserve(db, "two", "a", 80)).created, true);
  assert.equal((await reserve(db, "three", "a", 1)).created, false);
  assert.equal((await settle(db, "two", "a", 0)).settled, true);
  assert.equal((await reserve(db, "three", "a", 1)).created, true);
});

test("concurrent conflicting settlements record exactly one final amount", async (t) => {
  const db = await setup(t);
  assert.equal((await reserve(db, "one")).created, true);
  const results = await Promise.all([settle(db, "one", "a", 20), settle(db, "one", "a", 30)]);
  assert.equal(results.filter((r) => r.settled).length, 1);
  assert.equal(results.filter((r) => r.reason === "SETTLEMENT_CONFLICT").length, 1);
  const row = await db.prepare("SELECT actual_micros FROM browser_budget_sessions WHERE session_id = 'one'").first();
  assert.ok(row.actual_micros === 20 || row.actual_micros === 30);
});

test("underestimated final costs are recorded and block subsequent spending", async (t) => {
  const db = await setup(t);
  assert.equal((await reserve(db, "one")).created, true);
  assert.equal((await settle(db, "one", "a", 101)).settled, true);
  assert.equal((await reserve(db, "two", "a", 1)).created, false);
  const row = await db.prepare("SELECT actual_micros FROM browser_budget_sessions WHERE session_id = 'one'").first();
  assert.equal(row.actual_micros, 101);
});

test("reservations spanning a UTC period remain charged until settled", async (t) => {
  const db = await setup(t, { daily: 60, monthly: 120, tenantMonthly: 120 });
  assert.equal((await reserve(db, "old")).created, true);
  await db.prepare("UPDATE browser_budget_sessions SET day = '2000-01-01', month = '2000-01' WHERE session_id = 'old'").run();
  assert.equal((await reserve(db, "while-open", "a", 1)).created, false);
  assert.equal((await settle(db, "old", "a", 60)).settled, true);
  assert.equal((await reserve(db, "settled-today", "a", 1)).created, false);
  await db.prepare("UPDATE browser_budget_sessions SET settled_at = '2000-01-01T12:00:00.000Z' WHERE session_id = 'old'").run();
  assert.equal((await reserve(db, "new")).created, true);
  assert.equal((await reserve(db, "more", "a", 1)).created, false);
});

test("previous-month open sessions also count against global and tenant monthly limits", async (t) => {
  for (const [limits, secondTenant] of [
    [{ daily: 500, monthly: 60, tenantMonthly: 500 }, "b"],
    [{ daily: 500, monthly: 500, tenantMonthly: 60 }, "a"],
  ]) {
    const db = await setup(t, limits);
    assert.equal((await reserve(db, "old")).created, true);
    await db.prepare("UPDATE browser_budget_sessions SET day = '2000-01-01', month = '2000-01' WHERE session_id = 'old'").run();
    assert.equal((await reserve(db, "new", secondTenant, 1)).created, false);
  }
});

test("future ledger periods fail closed on clock anomalies", async (t) => {
  const db = await setup(t);
  assert.equal((await reserve(db, "old")).created, true);
  await db.prepare("UPDATE browser_budget_sessions SET day = '9999-12-31', month = '9999-12' WHERE session_id = 'old'").run();
  assert.equal((await reserve(db, "new", "a", 1)).created, false);
});

test("invalid inputs and database failures are surfaced without authorization", async (t) => {
  const db = await setup(t);
  for (const amountMicros of [0, -1, 1.5, NaN, Number.MAX_SAFE_INTEGER]) {
    await assert.rejects(() => reserve(db, "bad", "a", amountMicros), TypeError);
  }
  await assert.rejects(() => reserve(db, "", "a", 1), TypeError);
  await assert.rejects(() => settle(db, "missing", "a", -1), TypeError);
  await assert.rejects(() => reserve(null, "x", "a", 1), TypeError);
  await db.prepare("DROP TABLE browser_budget_global").run();
  await assert.rejects(() => reserve(db, "db-error"));
});
