-- Run in Supabase SQL Editor if teams lack avatar columns
ALTER TABLE teams ADD COLUMN IF NOT EXISTS avatar_color text;
ALTER TABLE teams ADD COLUMN IF NOT EXISTS avatar_url text;
