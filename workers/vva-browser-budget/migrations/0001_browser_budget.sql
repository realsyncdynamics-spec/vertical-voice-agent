CREATE TABLE browser_budget_global (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  currency TEXT NOT NULL CHECK (currency GLOB '[A-Z][A-Z][A-Z]'),
  daily_limit_micros INTEGER NOT NULL CHECK (typeof(daily_limit_micros) = 'integer' AND daily_limit_micros BETWEEN 0 AND 1000000000000),
  monthly_limit_micros INTEGER NOT NULL CHECK (typeof(monthly_limit_micros) = 'integer' AND monthly_limit_micros BETWEEN 0 AND 1000000000000),
  session_limit_micros INTEGER NOT NULL CHECK (typeof(session_limit_micros) = 'integer' AND session_limit_micros BETWEEN 0 AND 1000000000000)
);

CREATE TABLE browser_budget_tenants (
  tenant_id TEXT PRIMARY KEY NOT NULL,
  monthly_limit_micros INTEGER NOT NULL CHECK (typeof(monthly_limit_micros) = 'integer' AND monthly_limit_micros BETWEEN 0 AND 1000000000000),
  session_limit_micros INTEGER NOT NULL CHECK (typeof(session_limit_micros) = 'integer' AND session_limit_micros BETWEEN 0 AND 1000000000000)
);

CREATE TABLE browser_budget_sessions (
  session_id TEXT PRIMARY KEY NOT NULL,
  tenant_id TEXT NOT NULL,
  currency TEXT NOT NULL,
  day TEXT NOT NULL,
  month TEXT NOT NULL,
  reserved_micros INTEGER NOT NULL CHECK (typeof(reserved_micros) = 'integer' AND reserved_micros BETWEEN 1 AND 1000000000000),
  actual_micros INTEGER CHECK (actual_micros IS NULL OR (typeof(actual_micros) = 'integer' AND actual_micros BETWEEN 0 AND 1000000000000)),
  settled_at TEXT,
  CHECK ((actual_micros IS NULL AND settled_at IS NULL) OR (actual_micros IS NOT NULL AND settled_at IS NOT NULL))
);
CREATE INDEX browser_budget_sessions_day ON browser_budget_sessions(day);
CREATE INDEX browser_budget_sessions_month ON browser_budget_sessions(month);
CREATE INDEX browser_budget_sessions_tenant_month ON browser_budget_sessions(tenant_id, month);
