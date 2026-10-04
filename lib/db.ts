/** Row types mirroring supabase/migrations/0001_duplex.sql */

export interface DbUser {
  id: string;
  github_id: number;
  github_username: string;
  github_email: string | null;
  github_token: string | null;
  created_at: string;
}

export interface DbWorkspace {
  id: string;
  name: string;
  github_repo: string;
  github_base_branch: string;
  github_base_sha: string | null;
  join_code: string;
  join_code_expires_at: string;
  created_by: string;
  status: "active" | "finalized";
  created_at: string;
}

export interface DbAgent {
  id: string;
  workspace_id: string;
  user_id: string;
  name: string;
  client_type: "claude-code" | "codex" | "other";
  username_label: string | null;
  session_token: string | null;
  status: "pending" | "active" | "offline";
  current_path: string | null;
  current_task: string | null;
  last_seen: string | null;
  last_read_at: string | null;
  /** The workspace_members row whose join code this agent joined with (null = pre-members). */
  member_id: string | null;
  created_at: string;
}

export interface DbWorkspaceMember {
  id: string;
  workspace_id: string;
  /** Normalized to lowercase at write time (GitHub logins are case-insensitive). */
  github_username: string;
  join_code: string;
  join_code_expires_at: string;
  created_at: string;
}

export interface DbFile {
  workspace_id: string;
  path: string;
  content: string;
  version: number;
  updated_by_agent: string | null;
  updated_at: string;
}

export interface DbEdit {
  id: string;
  workspace_id: string;
  agent_id: string | null;
  user_id: string | null;
  path: string;
  before_version: number;
  after_version: number;
  timestamp: string;
}

export interface DbMessage {
  id: string;
  workspace_id: string;
  sender_agent_id: string | null;
  recipient_agent_id: string | null;
  message: string;
  created_at: string;
}

export interface DbClaim {
  id: string;
  workspace_id: string;
  agent_id: string;
  path: string;
  intent: string | null;
  expires_at: string;
  created_at: string;
}
