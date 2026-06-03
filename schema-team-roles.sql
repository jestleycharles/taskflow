-- Team display roles (run in Supabase SQL Editor)

ALTER TABLE teams
  ADD COLUMN IF NOT EXISTS separate_role_members BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS team_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color_hex TEXT NOT NULL DEFAULT '#4f6ef7',
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT team_roles_name_len CHECK (char_length(trim(name)) >= 1 AND char_length(trim(name)) <= 48),
  CONSTRAINT team_roles_color_hex CHECK (color_hex ~ '^#[0-9A-Fa-f]{6}$')
);

CREATE INDEX IF NOT EXISTS team_roles_team_id_sort_idx ON team_roles (team_id, sort_order);

ALTER TABLE team_members
  ADD COLUMN IF NOT EXISTS custom_role_id UUID REFERENCES team_roles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS team_members_custom_role_id_idx ON team_members (custom_role_id);
