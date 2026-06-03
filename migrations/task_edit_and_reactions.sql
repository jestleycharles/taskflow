-- Task title/description edit history (mirrors chat edit columns)
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS title_before_edit TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS description_before_edit TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS title_edited_at TIMESTAMPTZ;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS description_edited_at TIMESTAMPTZ;

-- System activity lines in task comments
ALTER TABLE comments ADD COLUMN IF NOT EXISTS is_system BOOLEAN NOT NULL DEFAULT FALSE;

-- Reactions on team chat messages and task comments
CREATE TABLE IF NOT EXISTS message_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_type TEXT NOT NULL CHECK (message_type IN ('chat', 'comment')),
  message_id UUID NOT NULL,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (message_type, message_id, user_id, emoji)
);

CREATE INDEX IF NOT EXISTS idx_message_reactions_lookup
  ON message_reactions (message_type, message_id);
