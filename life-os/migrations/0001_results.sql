CREATE TABLE IF NOT EXISTS results (
  id TEXT PRIMARY KEY,
  external_id TEXT NOT NULL UNIQUE,
  task_name TEXT NOT NULL,
  task_type TEXT NOT NULL,
  subject TEXT NOT NULL,
  status TEXT NOT NULL,
  requires_attention INTEGER NOT NULL CHECK (requires_attention IN (0,1)),
  summary TEXT NOT NULL,
  details TEXT NOT NULL,
  source TEXT NOT NULL,
  execution_time TEXT NOT NULL,
  received_time TEXT NOT NULL,
  processing_status TEXT NOT NULL DEFAULT 'stored'
);
CREATE INDEX IF NOT EXISTS results_newest ON results(execution_time DESC, received_time DESC);
CREATE TABLE IF NOT EXISTS bridge_status (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  checked_time TEXT NOT NULL,
  state TEXT NOT NULL,
  external_id TEXT NOT NULL,
  message TEXT NOT NULL
);
