const MAX_MICROS = 1_000_000_000_000;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

function assertId(value, name) {
  if (typeof value !== "string" || !ID.test(value)) throw new TypeError(`Invalid ${name}`);
}

function assertMicros(value, allowZero = false) {
  if (!Number.isSafeInteger(value) || value < (allowZero ? 0 : 1) || value > MAX_MICROS) {
    throw new TypeError("Invalid monetary amount");
  }
}

function assertDb(db) {
  if (!db || typeof db.prepare !== "function") throw new TypeError("Browser budget D1 is required");
}

/**
 * Only a result with created=true authorizes a new provider session. A retry
 * with the same ID is never authorization to open another connection.
 */
export async function reserveBrowserBudget(db, { sessionId, tenantId, amountMicros }) {
  assertDb(db);
  assertId(sessionId, "sessionId");
  assertId(tenantId, "tenantId");
  assertMicros(amountMicros);

  const result = await db.prepare(`
    INSERT INTO browser_budget_sessions
      (session_id, tenant_id, currency, day, month, reserved_micros)
    SELECT ?1, ?2, g.currency, date('now'), strftime('%Y-%m', 'now'), ?3
    FROM browser_budget_global g
    JOIN browser_budget_tenants t ON t.tenant_id = ?2
    WHERE g.id = 1
      AND ?3 <= g.session_limit_micros AND ?3 <= t.session_limit_micros
      AND NOT EXISTS (SELECT 1 FROM browser_budget_sessions WHERE currency != g.currency)
      AND NOT EXISTS (SELECT 1 FROM browser_budget_sessions WHERE day > date('now') OR month > strftime('%Y-%m', 'now'))
      AND NOT EXISTS (SELECT 1 FROM browser_budget_sessions
                      WHERE (actual_micros IS NULL) != (settled_at IS NULL)
                         OR settled_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      AND COALESCE((SELECT SUM(COALESCE(actual_micros, reserved_micros))
                    FROM browser_budget_sessions
                    WHERE day <= date('now') AND (actual_micros IS NULL OR substr(settled_at, 1, 10) >= date('now'))), 0) <= g.daily_limit_micros - ?3
      AND COALESCE((SELECT SUM(COALESCE(actual_micros, reserved_micros))
                    FROM browser_budget_sessions
                    WHERE month <= strftime('%Y-%m', 'now') AND (actual_micros IS NULL OR substr(settled_at, 1, 7) >= strftime('%Y-%m', 'now'))), 0) <= g.monthly_limit_micros - ?3
      AND COALESCE((SELECT SUM(COALESCE(actual_micros, reserved_micros))
                    FROM browser_budget_sessions
                    WHERE tenant_id = ?2 AND month <= strftime('%Y-%m', 'now') AND (actual_micros IS NULL OR substr(settled_at, 1, 7) >= strftime('%Y-%m', 'now'))), 0) <= t.monthly_limit_micros - ?3
    ON CONFLICT(session_id) DO NOTHING
  `).bind(sessionId, tenantId, amountMicros).run();

  if (result.meta.changes === 1) return { created: true };
  const existing = await db.prepare(
    "SELECT tenant_id, reserved_micros FROM browser_budget_sessions WHERE session_id = ?"
  ).bind(sessionId).first();
  if (existing) {
    if (existing.tenant_id !== tenantId || existing.reserved_micros !== amountMicros) {
      return { created: false, reason: "IDEMPOTENCY_CONFLICT" };
    }
    return { created: false, reason: "ALREADY_RESERVED" };
  }
  return { created: false, reason: "BUDGET_UNAVAILABLE_OR_LIMIT_REACHED" };
}

/**
 * Settles only from authoritative final provider usage. Outstanding
 * reservations remain charged against the limits until then.
 */
export async function settleBrowserBudget(db, { sessionId, tenantId, actualMicros }) {
  assertDb(db);
  assertId(sessionId, "sessionId");
  assertId(tenantId, "tenantId");
  assertMicros(actualMicros, true);

  const result = await db.prepare(`
    UPDATE browser_budget_sessions
    SET actual_micros = ?1, settled_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    WHERE session_id = ?2 AND tenant_id = ?3 AND actual_micros IS NULL
  `).bind(actualMicros, sessionId, tenantId).run();
  if (result.meta.changes === 1) return { settled: true };

  const existing = await db.prepare(
    "SELECT actual_micros FROM browser_budget_sessions WHERE session_id = ? AND tenant_id = ?"
  ).bind(sessionId, tenantId).first();
  if (!existing) return { settled: false, reason: "NOT_FOUND" };
  return { settled: false, reason: existing.actual_micros === actualMicros ? "ALREADY_SETTLED" : "SETTLEMENT_CONFLICT" };
}
