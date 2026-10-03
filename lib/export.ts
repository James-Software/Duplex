import { githubApi } from "./github";
import { supabaseAdmin } from "./supabase";
import type { DbAgent, DbUser, DbWorkspace } from "./db";

export interface FinalizeResult {
  branch: string;
  prUrl: string | null;
  prNumber: number | null;
  commits: { sha: string; agentName: string; files: string[] }[];
  filesChanged: number;
}

interface GhTree {
  sha: string;
}
interface GhCommit {
  sha: string;
  tree: { sha: string };
}

/**
 * Freeze the workspace and export it to GitHub:
 * branch collab/<short-id> -> one commit per contributing agent ->
 * pull request. Commits are authored by the human; agent provenance
 * travels in trailers.
 */
export async function finalizeWorkspace(
  workspace: DbWorkspace,
  owner: DbUser
): Promise<FinalizeResult> {
  if (!owner.github_token) throw new Error("GitHub token missing — please sign in again.");
  const token = owner.github_token;
  const repo = workspace.github_repo;
  const branchName = `collab/${workspace.id.slice(0, 8)}`;
  const db = supabaseAdmin();

  // Freeze first so no agent can edit mid-export.
  await db.from("workspaces").update({ status: "finalized" }).eq("id", workspace.id);

  try {
    const { data: fileRows } = await db
      .from("workspace_files")
      .select("path, content, updated_by_agent")
      .eq("workspace_id", workspace.id)
      // Only files actually touched by agents. Repo-seeded files (with a null
      // editor) stay out of the export — the PR contains exactly what changed.
      .not("updated_by_agent", "is", null);
    const files = (fileRows ?? []) as {
      path: string;
      content: string;
      updated_by_agent: string | null;
    }[];
    if (files.length === 0) throw new Error("Nothing to export — the workspace is empty.");

    const { data: agentRows } = await db
      .from("agents")
      .select("id, name, current_task")
      .eq("workspace_id", workspace.id)
      .order("created_at", { ascending: true });
    const agents = (agentRows ?? []) as Pick<DbAgent, "id" | "name" | "current_task">[];
    const agentName = (id: string | null) =>
      agents.find((a) => a.id === id)?.name ?? "workspace";

    // Group files by last editor (null group last).
    const groups = new Map<string | null, typeof files>();
    for (const f of files) {
      const key = f.updated_by_agent;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(f);
    }
    const ordered = [...groups.entries()].sort(([a], [b]) => {
      if (a === null) return 1;
      if (b === null) return -1;
      return (
        agents.findIndex((x) => x.id === a) - agents.findIndex((x) => x.id === b)
      );
    });

    const authorEmail =
      owner.github_email ?? `${owner.github_username}@users.noreply.github.com`;
    const author = { name: owner.github_username, email: authorEmail };

    let parentSha: string = workspace.github_base_sha!;
    let parentTree: string = (
      (await githubApi(token, `/repos/${repo}/git/commits/${parentSha}`)) as GhCommit
    ).tree.sha;

    const commits: FinalizeResult["commits"] = [];
    for (const [agentId, groupFiles] of ordered) {
      const name = agentName(agentId);
      const blobs = [];
      for (const f of groupFiles) {
        const blob = (await githubApi(token, `/repos/${repo}/git/blobs`, {
          method: "POST",
          body: JSON.stringify({
            content: Buffer.from(f.content, "utf8").toString("base64"),
            encoding: "base64",
          }),
        })) as { sha: string };
        blobs.push({ path: f.path, mode: "100644", type: "blob", sha: blob.sha });
      }
      const tree = (await githubApi(token, `/repos/${repo}/git/trees`, {
        method: "POST",
        body: JSON.stringify({ base_tree: parentTree, tree: blobs }),
      })) as GhTree;

      const fileList = groupFiles.map((f) => `- ${f.path}`).join("\n");
      const message = [
        `Duplex: ${name} — ${groupFiles.length} file${groupFiles.length === 1 ? "" : "s"}`,
        "",
        "Files:",
        fileList,
        "",
        `Agent: ${name}`,
        ...(agentId ? [`Agent-ID: ${agentId}`] : []),
        `Workspace: ${workspace.id}`,
      ].join("\n");

      const commit = (await githubApi(token, `/repos/${repo}/git/commits`, {
        method: "POST",
        body: JSON.stringify({
          message,
          tree: tree.sha,
          parents: [parentSha],
          author,
          committer: author,
        }),
      })) as { sha: string };
      commits.push({ sha: commit.sha, agentName: name, files: groupFiles.map((f) => f.path) });
      parentSha = commit.sha;
      parentTree = tree.sha;
    }

    // Create the branch at the final commit.
    await githubApi(token, `/repos/${repo}/git/refs`, {
      method: "POST",
      body: JSON.stringify({ ref: `refs/heads/${branchName}`, sha: parentSha }),
    });

    // Open the PR.
    const prBody = [
      `## Duplex collaboration export`,
      ``,
      `Workspace **${workspace.name}** (\`${workspace.id}\`) → \`${workspace.github_base_branch}\``,
      ``,
      `### Commits (${commits.length})`,
      ...commits.map(
        (c) => `- \`${c.sha.slice(0, 7)}\` — ${c.agentName} (${c.files.length} files)`
      ),
      ``,
      `### Agents`,
      ...agents.map((a) =>
        a.current_task ? `- ${a.name}\n  > ${a.current_task}` : `- ${a.name}`
      ),
      ``,
      `### Files changed (${files.length})`,
      ...files.map((f) => `- \`${f.path}\` (last by ${agentName(f.updated_by_agent)})`),
    ].join("\n");

    let prUrl: string | null = null;
    let prNumber: number | null = null;
    try {
      const pr = (await githubApi(token, `/repos/${repo}/pulls`, {
        method: "POST",
        body: JSON.stringify({
          title: `Duplex: ${workspace.name}`,
          head: branchName,
          base: workspace.github_base_branch,
          body: prBody,
        }),
      })) as { html_url: string; number: number };
      prUrl = pr.html_url;
      prNumber = pr.number;
    } catch {
      // Branch is pushed; PR creation is best-effort (e.g. no diff edge cases).
    }

    return { branch: branchName, prUrl, prNumber, commits, filesChanged: files.length };
  } catch (e) {
    // Un-freeze so the user can retry.
    await db.from("workspaces").update({ status: "active" }).eq("id", workspace.id);
    throw e;
  }
}
