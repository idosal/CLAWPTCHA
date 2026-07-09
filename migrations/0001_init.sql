CREATE TABLE installations (
  id INTEGER PRIMARY KEY,           -- GitHub installation id
  account_login TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- One challenge per (repo, PR, head_sha). Holds gate state + attempt counters.
CREATE TABLE challenges (
  id TEXT PRIMARY KEY,              -- unguessable token (crypto random, hex)
  installation_id INTEGER NOT NULL,
  repo_full_name TEXT NOT NULL,     -- "owner/name"
  pr_number INTEGER NOT NULL,
  head_sha TEXT NOT NULL,
  author_login TEXT NOT NULL,
  check_run_id INTEGER,
  status TEXT NOT NULL DEFAULT 'awaiting_approval',
    -- awaiting_approval | ready | passed | failed_assisted | failed_final | neutral | superseded
  approved_by TEXT,
  attempts_used INTEGER NOT NULL DEFAULT 0,
  cooldown_until TEXT,
  config_json TEXT NOT NULL,        -- resolved VouchaConfig snapshot
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (repo_full_name, pr_number, head_sha)
);

-- One quiz per attempt. questions_json includes correct answers: server-side only.
CREATE TABLE quizzes (
  id TEXT PRIMARY KEY,
  challenge_id TEXT NOT NULL REFERENCES challenges(id),
  attempt_number INTEGER NOT NULL,
  questions_json TEXT NOT NULL,
  current_question INTEGER NOT NULL DEFAULT 0,
  question_served_at TEXT,
  answers_json TEXT NOT NULL DEFAULT '[]',   -- Answer[] (see quiz/schema.ts)
  telemetry_json TEXT NOT NULL DEFAULT '{}',
  turnstile_ok INTEGER,
  started_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  finished_at TEXT,
  score INTEGER
);

-- Quiz-taking browser sessions, bound to a GitHub login after author verification.
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  challenge_id TEXT NOT NULL REFERENCES challenges(id),
  gh_login TEXT,                    -- null until the author verifies from GitHub
  oauth_state TEXT,                 -- legacy OAuth state; retained for old deployments
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- Sliding-window rate limiting events.
CREATE TABLE rate_events (
  scope TEXT NOT NULL,              -- 'user:<login>' | 'repo:<full>' | 'inst:<id>'
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_rate_events ON rate_events(scope, created_at);
CREATE INDEX idx_challenges_pr ON challenges(repo_full_name, pr_number);
CREATE INDEX idx_quizzes_challenge ON quizzes(challenge_id);
CREATE INDEX idx_sessions_oauth_state ON sessions(oauth_state);
