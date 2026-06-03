-- Per-user last-read timestamp for team chat unread badges (persists across refresh and sign-out).
CREATE TABLE IF NOT EXISTS team_chat_read_state (
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (team_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_team_chat_read_state_user ON team_chat_read_state(user_id);
