-- Run in Supabase SQL Editor (after existing DM tables)

CREATE TABLE IF NOT EXISTS dm_blocked_emails (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, email)
);

CREATE TABLE IF NOT EXISTS dm_user_blocks (
  blocker_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (blocker_id, blocked_user_id),
  CHECK (blocker_id <> blocked_user_id)
);

CREATE TABLE IF NOT EXISTS dm_ignored_users (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ignored_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, ignored_user_id),
  CHECK (user_id <> ignored_user_id)
);

CREATE INDEX IF NOT EXISTS idx_dm_blocked_emails_email ON dm_blocked_emails (email);
