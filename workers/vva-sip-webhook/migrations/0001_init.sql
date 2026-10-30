-- VVA Telefonie-Laufzeit (D1). Kein Audio. Keine Secrets.
CREATE TABLE IF NOT EXISTS templates (key TEXT PRIMARY KEY, version TEXT NOT NULL, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS tenants (agent_id TEXT PRIMARY KEY, template TEXT NOT NULL, phone_number TEXT UNIQUE, data TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS webhook_events (webhook_id TEXT PRIMARY KEY, call_id TEXT, received_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS calls (
  call_id TEXT PRIMARY KEY, agent_id TEXT, template TEXT, template_version TEXT,
  from_number TEXT, to_number TEXT, status TEXT NOT NULL,           -- active | ended | rejected
  reject_reason TEXT, started_at TEXT NOT NULL, ended_at TEXT, duration_sec INTEGER,
  reserved_min INTEGER NOT NULL DEFAULT 0, handoff TEXT, errors TEXT, month TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_calls_tenant ON calls(agent_id, status, month);
CREATE TABLE IF NOT EXISTS call_actions (id INTEGER PRIMARY KEY AUTOINCREMENT, call_id TEXT NOT NULL, agent_id TEXT, action TEXT NOT NULL, decision TEXT NOT NULL, args TEXT, result TEXT, created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_actions_call ON call_actions(call_id);
CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, agent_id TEXT NOT NULL, call_id TEXT, kind TEXT NOT NULL, payload TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS transcripts (id INTEGER PRIMARY KEY AUTOINCREMENT, call_id TEXT NOT NULL, agent_id TEXT NOT NULL, role TEXT NOT NULL, text TEXT NOT NULL, created_at TEXT NOT NULL);
