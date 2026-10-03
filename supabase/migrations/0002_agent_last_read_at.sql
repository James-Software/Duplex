-- Track per-agent message read position so get_team_status can deliver
-- unread messages inline (message-in-poll).
alter table public.agents
  add column if not exists last_read_at timestamptz;
