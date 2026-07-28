BEGIN;

CREATE TABLE IF NOT EXISTS admin_login_attempts (
  client_key TEXT PRIMARY KEY,
  failure_count INTEGER NOT NULL CHECK (failure_count > 0),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS admin_login_attempts_expires_at_idx
  ON admin_login_attempts (expires_at);

COMMIT;
