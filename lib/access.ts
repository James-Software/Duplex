import { supabaseAdmin } from "./supabase";
import { generateJoinCode, joinCodeExpiry } from "./workspaces";
import type { DbUser, DbWorkspace, DbWorkspaceMember } from "./db";

export interface ViewerAccess {
  workspace: DbWorkspace;
  isOwner: boolean;
  /** The viewer's own member row (null only if it hasn't been created yet). */
  member: DbWorkspaceMember | null;
}

/** GitHub logins are case-insensitive — normalize before storing/comparing. */
export function normalizeGithubUsername(u: string): string {
  return u.trim().toLowerCase();
}

/**
 * Resolve what a signed-in user may do with a workspace. Owner =
 * workspaces.created_by; member = a workspace_members row matching the
 * viewer's GitHub username. Returns null when the viewer has no access.
 * Never trust client-supplied member ids — membership always derives from
 * the session user's GitHub username.
 */
export async function getViewerAccess(
  workspaceId: string,
  user: DbUser
): Promise<ViewerAccess | null> {
  const db = supabaseAdmin();
  const { data: ws } = await db
    .from("workspaces")
    .select("*")
    .eq("id", workspaceId)
    .maybeSingle();
  if (!ws) return null;
  const workspace = ws as DbWorkspace;
  const isOwner = workspace.created_by === user.id;
  const { data: m } = await db
    .from("workspace_members")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("github_username", normalizeGithubUsername(user.github_username))
    .maybeSingle();
  const member = (m as DbWorkspaceMember | null) ?? null;
  if (!isOwner && !member) return null;
  return { workspace, isOwner, member };
}

/** Fetch the viewer's member row, creating it (fresh join code) if missing. */
export async function ensureMemberRow(
  workspaceId: string,
  githubUsername: string
): Promise<DbWorkspaceMember> {
  const db = supabaseAdmin();
  const uname = normalizeGithubUsername(githubUsername);
  const { data: existing } = await db
    .from("workspace_members")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("github_username", uname)
    .maybeSingle();
  if (existing) return existing as DbWorkspaceMember;
  const { data, error } = await db
    .from("workspace_members")
    .insert({
      workspace_id: workspaceId,
      github_username: uname,
      join_code: generateJoinCode(),
      join_code_expires_at: joinCodeExpiry(),
    })
    .select("*")
    .single();
  if (!error && data) return data as DbWorkspaceMember;
  // Lost a race with a concurrent insert — re-read instead of failing.
  const { data: retry } = await db
    .from("workspace_members")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("github_username", uname)
    .maybeSingle();
  if (retry) return retry as DbWorkspaceMember;
  throw new Error("Could not create member record.");
}

/** Issue a fresh join code for one member (invalidates their old one). */
export async function rotateMemberJoinCode(
  memberId: string
): Promise<DbWorkspaceMember> {
  const { data, error } = await supabaseAdmin()
    .from("workspace_members")
    .update({ join_code: generateJoinCode(), join_code_expires_at: joinCodeExpiry() })
    .eq("id", memberId)
    .select("*")
    .single();
  if (error || !data) throw new Error("Could not rotate join code.");
  return data as DbWorkspaceMember;
}
