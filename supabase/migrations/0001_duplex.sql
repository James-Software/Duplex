-- Duplex initial schema — Dublin HackX 2026-10-03
-- Applied via Supabase SQL editor / Management API.
-- The app talks to Postgres exclusively through the service_role key
-- (server-side only); RLS is enabled on every table as the locked-down default.

-- ============ users ============
create table public.users (
  id uuid primary key default gen_random_uuid(),
  github_id bigint not null unique,
  github_username text not null,
  github_email text,
  -- OAuth access token (repo scope) used for workspace init + GitHub export.
  -- Hackathon tradeoff: stored to keep the export flow working; rotate after.
  github_token text,
  created_at timestamptz not null default now()
);

-- ============ workspaces ============
create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  github_repo text not null,            -- "owner/repo"
  github_base_branch text not null default 'main',
  github_base_sha text,                 -- base commit the workspace was seeded from
  join_code text not null unique,       -- "XXXX-XXXX", short-lived
  join_code_expires_at timestamptz not null,
  created_by uuid not null references public.users(id) on delete cascade,
  status text not null default 'active', -- active | finalized
  created_at timestamptz not null default now()
);
create index workspaces_created_by_idx on public.workspaces (created_by);

-- ============ agents ============
create table public.agents (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  name text not null,                   -- "Claude #1", "Codex #2"
  client_type text not null,            -- "claude-code" | "codex" | "other"
  username_label text,                 -- self-asserted human label from the join prompt
  session_token text unique,           -- issued on approval; null while pending
  status text not null default 'pending', -- pending | active | offline
  current_path text,                   -- file the agent last touched (for the dashboard)
  current_task text,                   -- free-text intent (for the dashboard)
  last_seen timestamptz,
  created_at timestamptz not null default now()
);
create index agents_workspace_idx on public.agents (workspace_id);
create index agents_session_idx on public.agents (session_token);

-- ============ workspace_files ============
-- The cloud workspace IS this table. Every file carries a version number
-- for optimistic concurrency.
create table public.workspace_files (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  path text not null,
  content text not null default '',
  version integer not null default 1,
  updated_by_agent uuid references public.agents(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (workspace_id, path)
);
create index workspace_files_ws_idx on public.workspace_files (workspace_id);

-- ============ edits (provenance log) ============
create table public.edits (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  agent_id uuid references public.agents(id) on delete set null,
  user_id uuid references public.users(id) on delete set null,
  path text not null,
  before_version integer not null,
  after_version integer not null,
  timestamp timestamptz not null default now()
);
create index edits_workspace_idx on public.edits (workspace_id);

-- ============ messages (agent-to-agent) ============
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  sender_agent_id uuid references public.agents(id) on delete set null,
  recipient_agent_id uuid references public.agents(id) on delete set null, -- null = broadcast
  message text not null,
  created_at timestamptz not null default now()
);
create index messages_workspace_idx on public.messages (workspace_id);

-- ============ claims (advisory file reservations) ============
create table public.claims (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  agent_id uuid not null references public.agents(id) on delete cascade,
  path text not null,
  intent text,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (workspace_id, path)
);
create index claims_workspace_idx on public.claims (workspace_id);

-- ============ RLS: locked down; service_role bypasses ============
alter table public.users enable row level security;
alter table public.workspaces enable row level security;
alter table public.agents enable row level security;
alter table public.workspace_files enable row level security;
alter table public.edits enable row level security;
alter table public.messages enable row level security;
alter table public.claims enable row level security;
-- No permissive policies: only the service_role key (server-side) may read/write.
