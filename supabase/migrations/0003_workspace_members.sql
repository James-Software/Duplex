-- Duplex workspace members — Dublin HackX 2026-10-03
-- Per-member join codes + decentralized approvals. Every workspace member
-- (the owner included) gets their own join code; an agent joins with a
-- member's code and that member approves their own agents. The team list
-- still shows everybody's agents to everyone.

-- ============ workspace_members ============
create table public.workspace_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  github_username text not null, -- normalized to lowercase at write time
  join_code text not null unique,
  join_code_expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (workspace_id, github_username)
);
create index workspace_members_workspace_idx on public.workspace_members (workspace_id);
alter table public.workspace_members enable row level security;
-- No public policies: service_role (server-side) only, like every other table.

-- Which member's code an agent joined with (null = joined before members existed).
alter table public.agents
  add column if not exists member_id uuid references public.workspace_members(id) on delete set null;
create index if not exists agents_member_idx on public.agents (member_id);

-- Temporary code generator for the backfill below (the app generates codes at runtime).
create or replace function public.gen_member_join_code() returns text language plpgsql as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  code text := '';
  i int;
begin
  for i in 1..16 loop
    code := code || substr(alphabet, (floor(random() * 32) + 1)::int, 1);
  end loop;
  return substr(code,1,4) || '-' || substr(code,5,4) || '-' || substr(code,9,4) || '-' || substr(code,13,4);
end $$;

-- Backfill: one member row per workspace for its owner, with a fresh code.
do $$
declare
  r record;
  new_code text;
begin
  for r in
    select w.id as wid, u.github_username as gh
    from public.workspaces w join public.users u on u.id = w.created_by
  loop
    loop
      new_code := public.gen_member_join_code();
      exit when not exists (select 1 from public.workspace_members where join_code = new_code);
    end loop;
    insert into public.workspace_members (workspace_id, github_username, join_code, join_code_expires_at)
    values (r.wid, lower(trim(r.gh)), new_code, now() + interval '5 minutes')
    on conflict (workspace_id, github_username) do nothing;
  end loop;
end $$;

drop function public.gen_member_join_code();
