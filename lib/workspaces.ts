import { supabaseAdmin } from "./supabase";
import { githubApi } from "./github";
import type { DbUser, DbWorkspace } from "./db";

const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no ambiguous chars
const JOIN_CODE_TTL_MINUTES = 5;

/** Generate a code like "M7K4-P9Q2-X3B8-D5F6". */
export function generateJoinCode(): string {
  const pick = () =>
    CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  const group = () => Array.from({ length: 4 }, pick).join("");
  return `${group()}-${group()}-${group()}-${group()}`;
}

export function joinCodeExpiry(): string {
  return new Date(Date.now() + JOIN_CODE_TTL_MINUTES * 60 * 1000).toISOString();
}

const REPO_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

// --- Repo seeding ------------------------------------------------------------
// A session bound to a GitHub repo starts populated with that repo's files at
// the base SHA, so agents see the real codebase instead of an empty workspace.

const SEED_MAX_FILES = 200;
const SEED_MAX_BYTES = 100_000; // ~100KB per file
const SEED_CONCURRENCY = 15;

/** Extensions we never seed (binary formats). SVG is text — keep it. */
const SEED_SKIP_EXTENSIONS = new Set([
  "png", "jpg", "jpeg", "gif", "webp", "ico",
  "mp4", "mov", "avi", "mkv", "webm",
  "zip", "gz", "tar", "tgz", "bz2", "xz", "7z", "rar",
  "pdf",
  "woff", "woff2", "ttf", "eot", "otf",
  "mp3", "wav", "ogg", "flac", "aac",
  "exe", "dll", "so", "dylib", "class", "pyc", "pyo",
  "bin", "dat", "db", "sqlite", "sqlite3",
]);

interface GhTreeEntry {
  path: string;
  type: string;
  sha: string;
  size?: number;
}

interface GhBlob {
  content: string;
  encoding: string;
}

/**
 * Populate a new workspace with the repo's text files at the base SHA.
 * Best-effort: any failure leaves the workspace as-is (possibly empty) and
 * never throws — workspace creation must not fail because of seeding.
 */
async function seedWorkspaceFiles(
  workspaceId: string,
  repo: string,
  baseSha: string,
  token: string
): Promise<void> {
  const tree = (await githubApi(
    token,
    `/repos/${repo}/git/trees/${baseSha}?recursive=1`
  )) as { tree: GhTreeEntry[] };

  const candidates = tree.tree
    .filter((e) => e.type === "blob")
    .filter((e) => (e.size ?? 0) <= SEED_MAX_BYTES)
    .filter((e) => {
      const ext = e.path.split(".").pop()?.toLowerCase() ?? "";
      return !SEED_SKIP_EXTENSIONS.has(ext);
    })
    .slice(0, SEED_MAX_FILES);

  const rows: { workspace_id: string; path: string; content: string }[] = [];
  for (let i = 0; i < candidates.length; i += SEED_CONCURRENCY) {
    const batch = candidates.slice(i, i + SEED_CONCURRENCY);
    const results = await Promise.all(
      batch.map(async (entry) => {
        try {
          const blob = (await githubApi(
            token,
            `/repos/${repo}/git/blobs/${entry.sha}`
          )) as GhBlob;
          if (blob.encoding !== "base64" || !blob.content) return null;
          const text = Buffer.from(blob.content, "base64").toString("utf8");
          if (text.includes("\0")) return null; // binary sniff
          return { workspace_id: workspaceId, path: entry.path, content: text };
        } catch {
          return null; // skip failed blobs; keep going
        }
      })
    );
    for (const r of results) if (r) rows.push(r);
  }

  if (rows.length === 0) return;

  const db = supabaseAdmin();
  for (let i = 0; i < rows.length; i += 100) {
    const { error } = await db
      .from("workspace_files")
      .insert(rows.slice(i, i + 100));
    if (error) throw new Error(`seed insert failed: ${error.message}`);
  }
}

export interface CreateWorkspaceInput {
  /** Optional — defaults to the repo name (the part after "/"). */
  name?: string;
  github_repo: string;
  /** Optional — auto-detected from the repo's default branch when omitted. */
  github_base_branch?: string;
}

/**
 * Create a workspace (a collaboration session bound to one GitHub repo).
 * Validates the repo/branch against the GitHub API (using the creator's
 * OAuth token) and records the base SHA the cloud filesystem starts from.
 * The new workspace is seeded with the repo's files at the base SHA
 * (best-effort; never fails creation). One active session per repo — throws
 * if one already exists.
 */
export async function createWorkspace(
  user: DbUser,
  input: CreateWorkspaceInput
): Promise<DbWorkspace> {
  const repo = input.github_repo.trim();
  if (!REPO_PATTERN.test(repo)) {
    throw new Error('Repository must look like "owner/repo".');
  }
  if (!user.github_token) {
    throw new Error("GitHub token missing — please sign in again.");
  }

  const existing = await getActiveWorkspaceByRepo(user, repo);
  if (existing) {
    throw new Error("A session already exists for this repository.");
  }

  // Resolve the base branch: explicit choice wins, otherwise the repo default.
  let branch = (input.github_base_branch ?? "").trim();
  if (!branch) {
    try {
      const info = (await githubApi(
        user.github_token,
        `/repos/${repo}`
      )) as { default_branch?: string };
      branch = info.default_branch || "main";
    } catch {
      throw new Error(`Could not find repository "${repo}". Check the name.`);
    }
  }

  const name = (input.name ?? "").trim() || repo.split("/")[1] || repo;

  // Confirm the branch exists; capture the base commit SHA.
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
  const workspace = data as DbWorkspace;

  // The owner is also a member (with their own join code) so the whole
  // per-member code flow works uniformly.
  const { error: memberError } = await db.from("workspace_members").insert({
    workspace_id: workspace.id,
    github_username: user.github_username.trim().toLowerCase(),
    join_code: generateJoinCode(),
    join_code_expires_at: joinCodeExpiry(),
  });
  if (memberError) {
    throw new Error(`Could not create workspace: ${memberError.message}`);
  }

  // Seed the cloud filesystem with the repo's files. Non-fatal: if seeding
  // fails the workspace simply starts empty and agents create files from scratch.
  try {
    await seedWorkspaceFiles(
      workspace.id,
      repo,
      branchInfo.commit.sha,
      user.github_token
    );
  } catch {
    // intentionally ignored
  }

  return workspace;
}

/** Workspaces the user can open: owned OR shared with them as a member. */
export async function getUserWorkspaces(user: DbUser): Promise<DbWorkspace[]> {
  const db = supabaseAdmin();
  const { data: owned, error: ownedError } = await db
    .from("workspaces")
    .select("*")
    .eq("created_by", user.id);
  if (ownedError) throw new Error(ownedError.message);
  const { data: memberships } = await db
    .from("workspace_members")
    .select("workspace_id")
    .eq("github_username", user.github_username.trim().toLowerCase());
  const memberIds = ((memberships ?? []) as { workspace_id: string }[]).map(
    (m) => m.workspace_id
  );
  let shared: DbWorkspace[] = [];
  if (memberIds.length > 0) {
    const { data, error } = await db
      .from("workspaces")
      .select("*")
      .in("id", memberIds);
    if (error) throw new Error(error.message);
    shared = (data ?? []) as DbWorkspace[];
  }
  const byId = new Map<string, DbWorkspace>();
  for (const w of [...((owned ?? []) as DbWorkspace[]), ...shared]) byId.set(w.id, w);
  return [...byId.values()].sort((a, b) =>
    b.created_at.localeCompare(a.created_at)
  );
}

/** The active session bound to a repo, if any — one session per repo.
 *  Considers workspaces the user owns OR is a member of, so a member can't
 *  open a duplicate session for a repo that's already shared with them. */
export async function getActiveWorkspaceByRepo(
  user: DbUser,
  repo: string
): Promise<DbWorkspace | null> {
  const db = supabaseAdmin();
  const { data: owned, error: ownedError } = await db
    .from("workspaces")
    .select("*")
    .eq("created_by", user.id)
    .eq("github_repo", repo)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (ownedError) throw new Error(ownedError.message);
  if (owned) return owned as DbWorkspace;
  const { data: memberships } = await db
    .from("workspace_members")
    .select("workspace_id")
    .eq("github_username", user.github_username.trim().toLowerCase());
  const memberIds = ((memberships ?? []) as { workspace_id: string }[]).map(
    (m) => m.workspace_id
  );
  if (memberIds.length === 0) return null;
  const { data, error } = await db
    .from("workspaces")
    .select("*")
    .in("id", memberIds)
    .eq("github_repo", repo)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as DbWorkspace | null) ?? null;
}


