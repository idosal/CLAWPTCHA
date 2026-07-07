CREATE TABLE pr_investigations (
  id TEXT PRIMARY KEY,
  repo_full_name TEXT NOT NULL,
  pr_number INTEGER NOT NULL,
  head_sha TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'worker', -- worker | flue
  status TEXT NOT NULL,                  -- ready | failed
  artifact_json TEXT NOT NULL,
  error TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (repo_full_name, pr_number, head_sha)
);

CREATE INDEX idx_pr_investigations_pr
  ON pr_investigations(repo_full_name, pr_number, head_sha);

ALTER TABLE quizzes ADD COLUMN investigation_id TEXT;
