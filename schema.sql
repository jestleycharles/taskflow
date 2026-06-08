-- TaskFlow database schema for Supabase (PostgreSQL)
-- Run in Supabase SQL Editor (or psql) on a fresh project.
-- The Node app uses SUPABASE_SERVICE_ROLE_KEY for all table access.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================================
-- Users (app profiles; links to Supabase Auth via auth_id when applicable)
-- =============================================================================

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_id UUID UNIQUE,
  username TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT,
  avatar_color TEXT NOT NULL DEFAULT '#4f6ef7',
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS users_username_idx ON users (username);
CREATE INDEX IF NOT EXISTS users_email_idx ON users (email);
CREATE INDEX IF NOT EXISTS users_auth_id_idx ON users (auth_id) WHERE auth_id IS NOT NULL;

-- =============================================================================
-- Teams & membership
-- =============================================================================

CREATE TABLE IF NOT EXISTS teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  created_by UUID NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  avatar_color TEXT NOT NULL DEFAULT '#4f6ef7',
  avatar_url TEXT,
  separate_role_members BOOLEAN NOT NULL DEFAULT false,
  -- task = Kanban board (default); expense = TaskSplit shared expenses
  workspace_type TEXT NOT NULL DEFAULT 'task' CHECK (workspace_type IN ('task', 'expense')),
  -- solo | duo | group — only for expense workspaces
  expense_mode TEXT CHECK (expense_mode IS NULL OR expense_mode IN ('solo', 'duo', 'group')),
  -- ISO-like code for TaskSplit money display (default Philippine Peso)
  currency_code TEXT NOT NULL DEFAULT 'PHP' CHECK (
    currency_code IN ('PHP', 'USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'SGD', 'INR', 'MYR')
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    (workspace_type = 'task' AND expense_mode IS NULL)
    OR (workspace_type = 'expense' AND expense_mode IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS teams_created_by_idx ON teams (created_by);

CREATE TABLE IF NOT EXISTS team_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color_hex TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (team_id, name)
);

CREATE INDEX IF NOT EXISTS team_roles_team_id_idx ON team_roles (team_id, sort_order);

CREATE TABLE IF NOT EXISTS team_members (
  team_id UUID NOT NULL REFERENCES teams (id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  -- owner | member only (legacy admin rows: UPDATE team_members SET role = 'member' WHERE role = 'admin'; then alter CHECK)
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
  custom_role_id UUID REFERENCES team_roles (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (team_id, user_id)
);

CREATE INDEX IF NOT EXISTS team_members_user_id_idx ON team_members (user_id);

CREATE TABLE IF NOT EXISTS team_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams (id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  invited_by UUID REFERENCES users (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (team_id, user_id)
);

CREATE INDEX IF NOT EXISTS team_invites_user_id_idx ON team_invites (user_id);

CREATE TABLE IF NOT EXISTS team_invite_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams (id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  created_by UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ,
  max_uses INTEGER,
  use_count INTEGER NOT NULL DEFAULT 0,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS team_invite_links_team_id_idx ON team_invite_links (team_id);
CREATE INDEX IF NOT EXISTS team_invite_links_token_idx ON team_invite_links (token);

-- =============================================================================
-- Kanban columns (per-team; tasks.status stores column slug)
-- =============================================================================

CREATE TABLE IF NOT EXISTS team_columns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams (id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  color_hex TEXT NOT NULL DEFAULT '#64748b',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (team_id, slug)
);

CREATE INDEX IF NOT EXISTS team_columns_team_sort_idx ON team_columns (team_id, sort_order);

-- =============================================================================
-- Tasks, comments, activity
-- =============================================================================

CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams (id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'todo',
  cover_image_url TEXT,
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('urgent', 'high', 'medium', 'low')),
  due_date TIMESTAMPTZ,
  assigned_to UUID REFERENCES users (id) ON DELETE SET NULL,
  created_by UUID NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  position INTEGER NOT NULL DEFAULT 0,
  title_before_edit TEXT,
  title_edited_at TIMESTAMPTZ,
  description_before_edit TEXT,
  description_edited_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tasks_team_status_position_idx ON tasks (team_id, status, position);

CREATE TABLE IF NOT EXISTS task_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks (id) ON DELETE CASCADE,
  file_url TEXT NOT NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_size INTEGER NOT NULL DEFAULT 0,
  uploaded_by UUID NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS task_attachments_task_id_idx ON task_attachments (task_id);

CREATE TABLE IF NOT EXISTS comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks (id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  content_before_edit TEXT,
  edited_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  is_system BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS comments_task_id_created_idx ON comments (task_id, created_at);

CREATE TABLE IF NOT EXISTS task_comment_read_state (
  task_id UUID NOT NULL REFERENCES tasks (id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  last_read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (task_id, user_id)
);

CREATE TABLE IF NOT EXISTS activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams (id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  description TEXT NOT NULL,
  task_id UUID REFERENCES tasks (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS activity_log_team_created_idx ON activity_log (team_id, created_at DESC);

-- =============================================================================
-- TaskSplit — shared expenses (v1: equal split, running balances, settle up)
-- =============================================================================

CREATE TABLE IF NOT EXISTS expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams (id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  paid_by UUID NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  split_type TEXT NOT NULL DEFAULT 'equal' CHECK (split_type IN ('equal')),
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_by UUID NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS expenses_team_created_idx ON expenses (team_id, created_at DESC);

CREATE TABLE IF NOT EXISTS expense_participants (
  expense_id UUID NOT NULL REFERENCES expenses (id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  share_amount NUMERIC(12, 2) NOT NULL CHECK (share_amount >= 0),
  PRIMARY KEY (expense_id, user_id)
);

CREATE INDEX IF NOT EXISTS expense_participants_user_idx ON expense_participants (user_id);

CREATE TABLE IF NOT EXISTS expense_settlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams (id) ON DELETE CASCADE,
  from_user UUID NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  to_user UUID NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  note TEXT,
  created_by UUID NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  paid_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (from_user <> to_user)
);

CREATE INDEX IF NOT EXISTS expense_settlements_team_paid_idx
  ON expense_settlements (team_id, paid_at DESC);

CREATE TABLE IF NOT EXISTS expense_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_id UUID NOT NULL REFERENCES expenses (id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  content_before_edit TEXT,
  edited_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS expense_comments_expense_created_idx
  ON expense_comments (expense_id, created_at);

-- =============================================================================
-- Team chat
-- =============================================================================

CREATE TABLE IF NOT EXISTS team_chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams (id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  content_before_edit TEXT,
  edited_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS team_chat_messages_team_created_idx
  ON team_chat_messages (team_id, created_at);

CREATE TABLE IF NOT EXISTS team_chat_read_state (
  team_id UUID NOT NULL REFERENCES teams (id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  last_read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (team_id, user_id)
);

-- =============================================================================
-- Emoji reactions (chat, task comments, DMs)
-- =============================================================================

CREATE TABLE IF NOT EXISTS message_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_type TEXT NOT NULL CHECK (message_type IN ('chat', 'comment', 'dm', 'feature_post', 'expense_comment')),
  message_id UUID NOT NULL,
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  emoji TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (message_type, message_id, user_id, emoji)
);

CREATE INDEX IF NOT EXISTS message_reactions_lookup_idx
  ON message_reactions (message_type, message_id);

-- =============================================================================
-- Direct messages
-- =============================================================================

CREATE TABLE IF NOT EXISTS dm_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_a_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  user_b_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_message_at TIMESTAMPTZ,
  UNIQUE (user_a_id, user_b_id),
  CHECK (user_a_id <= user_b_id)
);

CREATE INDEX IF NOT EXISTS dm_conversations_participants_idx
  ON dm_conversations (user_a_id, user_b_id);

CREATE TABLE IF NOT EXISTS dm_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES dm_conversations (id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  content_before_edit TEXT,
  edited_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS dm_messages_conversation_created_idx
  ON dm_messages (conversation_id, created_at);

CREATE TABLE IF NOT EXISTS message_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_type TEXT NOT NULL CHECK (message_type IN ('chat', 'dm', 'comment', 'expense_comment')),
  message_id UUID NOT NULL,
  file_url TEXT NOT NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_size INTEGER NOT NULL DEFAULT 0,
  uploaded_by UUID NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS message_attachments_lookup_idx
  ON message_attachments (message_type, message_id);

CREATE INDEX IF NOT EXISTS message_attachments_uploaded_by_created_idx
  ON message_attachments (uploaded_by, created_at DESC);

CREATE TABLE IF NOT EXISTS dm_read_state (
  conversation_id UUID NOT NULL REFERENCES dm_conversations (id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  last_read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, user_id)
);

CREATE TABLE IF NOT EXISTS dm_blocked_emails (
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, email)
);

CREATE TABLE IF NOT EXISTS dm_user_blocks (
  blocker_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  blocked_user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_user_id),
  CHECK (blocker_id <> blocked_user_id)
);

CREATE TABLE IF NOT EXISTS dm_ignored_users (
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  ignored_user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, ignored_user_id),
  CHECK (user_id <> ignored_user_id)
);

-- =============================================================================
-- In-app feedback
-- =============================================================================

CREATE TABLE IF NOT EXISTS feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  user_email TEXT NOT NULL,
  username TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'feedback' CHECK (category IN ('feedback', 'bug')),
  message TEXT NOT NULL,
  session_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS feedback_created_idx ON feedback (created_at DESC);
CREATE INDEX IF NOT EXISTS feedback_session_id_idx ON feedback (session_id) WHERE session_id IS NOT NULL;

-- =============================================================================
-- Dashboard feature roadmap posts (social-style feed below teams)
-- =============================================================================

CREATE TABLE IF NOT EXISTS feature_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  caption TEXT NOT NULL,
  image_url TEXT,
  post_type TEXT NOT NULL CHECK (post_type IN ('in_progress', 'completed')),
  checklist_ref TEXT,
  created_by UUID NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS feature_posts_created_idx ON feature_posts (created_at DESC);

CREATE TABLE IF NOT EXISTS feature_post_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES feature_posts (id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS feature_post_comments_post_created_idx
  ON feature_post_comments (post_id, created_at);

-- =============================================================================
-- Row Level Security (optional hardening)
-- The Express server uses the service role key. Enable RLS to block direct
-- anon/authenticated API access to tables; no policies are required for the app.
-- =============================================================================

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_invite_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_columns ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_comment_read_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE expense_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE expense_settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_chat_read_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE dm_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE dm_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE dm_read_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE dm_blocked_emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE dm_user_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE dm_ignored_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE feature_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE feature_post_comments ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- Express session store (connect-pg-simple; auto-created on startup if missing)
-- =============================================================================

CREATE TABLE IF NOT EXISTS session (
  sid varchar NOT NULL,
  sess json NOT NULL,
  expire timestamp(6) NOT NULL,
  CONSTRAINT session_pkey PRIMARY KEY (sid)
);

CREATE INDEX IF NOT EXISTS idx_session_expire ON session (expire);

-- =============================================================================
-- Storage (Supabase Dashboard → Storage, public buckets):
--   avatars — {userId}/..., teams/{teamId}/...
--   task-files — tasks/{taskId}/...
--   chat-files — chat/{messageId}/..., dm/{messageId}/... (unguessable filenames)
--   feature-posts — posts/{postId}/...
-- =============================================================================

-- =============================================================================
-- Seed: shared guest account (required for "Continue as guest")
-- Create matching Supabase Auth user if you use Auth-only flows; the app only
-- needs this public.users row for guest sessions.
-- =============================================================================

INSERT INTO users (id, auth_id, username, email, password_hash, avatar_color)
VALUES (
  '00000000-0000-4000-8000-000000000001',
  NULL,
  'Guest',
  'guest@taskflow.app',
  NULL,
  '#64748b'
)
ON CONFLICT (email) DO NOTHING;

-- =============================================================================
-- Migrations for existing databases (run manually if already deployed)
-- =============================================================================


