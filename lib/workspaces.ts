import { supabaseAdmin } from "./supabase";
import { githubApi } from "./github";
import type { DbUser, DbWorkspace } from "./db";

const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no ambiguous chars
const JOIN_CODE_TTL_MINUTES = 30;

/** Generate a code like "M7K4-P9Q2". */
export function generateJoinCode(): string {
  const pick = () =>
    CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  const group = () => Array.from({ length: 4 }, pick).join("");
  return `${group()}-${group()}`;
}

export function joinCodeExpiry(): string {
  return new Date(Date.now() + JOIN_CODE_TTL_MINUTES * 60 * 1000).toISOString();
}

const REPO_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

export interface CreateWorkspaceInput {
  name: string;
  github_repo: string;
  github_base_branch?: string;
}

/**
 * Create a workspace: validates the repo/branch against the GitHub API
 * (using the creator's OAuth token) and records the base SHA the
 * cloud filesystem starts from.
 */
export async function createWorkspace(
  user: DbUser,
  input: CreateWorkspaceInput
): Promise<DbWorkspace> {
  const name = input.name.trim();
  const repo = input.github_repo.trim();
  const branch = (input.github_base_branch ?? "main").trim() || "main";

  if (!name) throw new Error("Workspace name is required.");
  if (!REPO_PATTERN.test(repo)) {
    throw new Error('Repository must look like "owner/repo".');
  }
  if (!user.github_token) {
    throw new Error("GitHub token missing — please sign in again.");
  }

  // Confirm the repo and branch exist; capture the base commit SHA.
  let branchInfo: { commit: { sha: string } };
  try {
    branchInfo = (await githubApi(
      user.github_token,
      `/repos/${repo}/branches/${encodeURIComponent(branch)}`
    )) as { commit: { sha: string } };
  } catch {
    throw new Error(
      `Could not find branch "${branch}" in ${repo}. Check the repo and branch name.`
    );
  }

  const db = supabaseAdmin();
  const { data, error } = await db
    .from("workspaces")
    .insert({
      name,
      github_repo: repo,
      github_base_branch: branch,
      github_base_sha: branchInfo.commit.sha,
      join_code: generateJoinCode(),
      join_code_expires_at: joinCodeExpiry(),
      created_by: user.id,
    })
    .select("*")
    .single();
  if (error || !data) {
    throw new Error(`Could not create workspace: ${error?.message ?? "unknown"}`);
  }
  return data as DbWorkspace;
}

export async function getUserWorkspaces(userId: string): Promise<DbWorkspace[]> {
  const { data, error } = await supabaseAdmin()
    .from("workspaces")
    .select("*")
    .eq("created_by", userId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as DbWorkspace[];
}

export async function getWorkspaceForUser(
  workspaceId: string,
  userId: string
): Promise<DbWorkspace | null> {
  const { data, error } = await supabaseAdmin()
    .from("workspaces")
    .select("*")
    .eq("id", workspaceId)
    .eq("created_by", userId)
    .single();
  if (error || !data) return null;
  return data as DbWorkspace;
}

/** Issue a fresh join code (invalidates the old one). */
export async function regenerateJoinCode(
  workspaceId: string,
  userId: string
): Promise<DbWorkspace> {
  const ws = await getWorkspaceForUser(workspaceId, userId);
  if (!ws) throw new Error("Workspace not found.");
  const { data, error } = await supabaseAdmin()
    .from("workspaces")
    .update({ join_code: generateJoinCode(), join_code_expires_at: joinCodeExpiry() })
    .eq("id", workspaceId)
    .select("*")
    .single();
  if (error || !data) throw new Error("Could not regenerate join code.");
  return data as DbWorkspace;
}
