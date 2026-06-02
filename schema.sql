-- ============================================================
-- TaskFlow — Supabase Schema
-- Run this entire file in your Supabase SQL Editor
-- ============================================================

-- Enable UUID generation
create extension if not exists "uuid-ossp";

-- ============================================================
-- USERS
-- ============================================================
create table if not exists users (
  id uuid primary key default uuid_generate_v4(),
  username text not null unique,
  email text not null unique,
  password_hash text not null,
  avatar_color text not null default '#4f6ef7',
  created_at timestamptz not null default now()
);

-- ============================================================
-- TEAMS
-- ============================================================
create table if not exists teams (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  description text,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ============================================================
-- TEAM MEMBERS
-- ============================================================
create table if not exists team_members (
  id uuid primary key default uuid_generate_v4(),
  team_id uuid not null references teams(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','admin','member')),
  joined_at timestamptz not null default now(),
  unique (team_id, user_id)
);

-- ============================================================
-- TASKS
-- ============================================================
create table if not exists tasks (
  id uuid primary key default uuid_generate_v4(),
  team_id uuid not null references teams(id) on delete cascade,
  title text not null,
  description text,
  status text not null default 'todo' check (status in ('todo','doing','done')),
  priority text not null default 'medium' check (priority in ('urgent','high','medium','low')),
  due_date date,
  assigned_to uuid references users(id) on delete set null,
  created_by uuid references users(id) on delete set null,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- COMMENTS
-- ============================================================
create table if not exists comments (
  id uuid primary key default uuid_generate_v4(),
  task_id uuid not null references tasks(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now()
);

-- ============================================================
-- ACTIVITY LOG
-- ============================================================
create table if not exists activity_log (
  id uuid primary key default uuid_generate_v4(),
  team_id uuid not null references teams(id) on delete cascade,
  user_id uuid references users(id) on delete set null,
  task_id uuid references tasks(id) on delete set null,
  type text not null,
  description text not null,
  created_at timestamptz not null default now()
);

-- ============================================================
-- INDEXES
-- ============================================================
create index if not exists idx_tasks_team_id on tasks(team_id);
create index if not exists idx_tasks_status on tasks(team_id, status);
create index if not exists idx_team_members_user on team_members(user_id);
create index if not exists idx_comments_task on comments(task_id);
create index if not exists idx_activity_team on activity_log(team_id, created_at desc);

-- ============================================================
-- ROW LEVEL SECURITY — Disable for service role usage
-- (We use service role key server-side, so RLS is bypassed)
-- You may enable RLS for additional safety if desired.
-- ============================================================
alter table users disable row level security;
alter table teams disable row level security;
alter table team_members disable row level security;
alter table tasks disable row level security;
alter table comments disable row level security;
alter table activity_log disable row level security;

-- ============================================================
-- DEFAULT GUEST USER
-- Password: guest1234  (bcrypt hash below)
-- ============================================================
insert into users (username, email, password_hash, avatar_color)
values (
  'Guest',
  'guest@taskflow.app',
  '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi',
  '#6366f1'
)
on conflict (email) do nothing;

-- ============================================================
-- SAMPLE DATA (optional — delete if not needed)
-- ============================================================
-- After running the schema, you can log in as guest and create teams from the UI.
-- The guest password is: guest1234
