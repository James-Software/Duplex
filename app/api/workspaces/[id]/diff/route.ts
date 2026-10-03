import { NextResponse } from "next/server";
import { diffLines } from "diff";
import { getSessionUser } from "@/lib/auth";
import { getWorkspaceForUser } from "@/lib/workspaces";
import { supabaseAdmin } from "@/lib/supabase";
import { githubApi } from "@/lib/github";

const MAX_FILE_BYTES = 200_000;
const MAX_DIFF_LINES = 300;
const CONTEXT_LINES = 3;
const FETCH_CONCURRENCY = 8;

type LineType = "add" | "del" | "context";
interface DiffLine {
  type: LineType;
  text: string;
}
interface Hunk {
  lines: DiffLine[];
}
interface FileDiff {
  path: string;
  status: "added" | "modified" | "deleted";
  additions: number;
  deletions: number;
  hunks: Hunk[];
  tooLarge?: true;
  binary?: true;
  truncated?: true;
}

/** Fetch a file's content from the GitHub base SHA. Null = not in base. */
async function fetchBaseContent(
  token: string,
  repo: string,
  sha: string,
  path: string
): Promise<string | null> {
  const encoded = path
    .split("/")
    .map((seg) => encodeURIComponent(seg))
    .join("/");
  try {
    const res = (await githubApi(
      token,
      `/repos/${repo}/contents/${encoded}?ref=${sha}`
    )) as { type?: string; content?: string; encoding?: string } | null;
    if (!res || res.type !== "file" || typeof res.content !== "string") return null;
    return Buffer.from(res.content.replace(/\n/g, ""), "base64").toString("utf8");
  } catch (e) {
    // 404 = path doesn't exist at the base SHA.
    if (e instanceof Error && e.message.includes("GitHub API 404")) return null;
    throw e;
  }
}

function isBinary(text: string): boolean {
  return text.indexOf("\0") !== -1;
}

function toLines(oldStr: string, newStr: string): DiffLine[] {
  const lines: DiffLine[] = [];
  for (const part of diffLines(oldStr, newStr)) {
    const type: LineType = part.added ? "add" : part.removed ? "del" : "context";
    const raw = part.value.split("\n");
    // diffLines leaves a trailing "" when the value ends with \n.
    if (raw.length > 0 && raw[raw.length - 1] === "") raw.pop();
    for (const text of raw) lines.push({ type, text });
  }
  return lines;
}

/** Group changed lines into hunks with a few context lines on each side. */
function toHunks(lines: DiffLine[]): Hunk[] {
  const idx: number[] = [];
  lines.forEach((l, i) => {
    if (l.type !== "context") idx.push(i);
  });
  if (idx.length === 0) return [];
  const windows: [number, number][] = [];
  let start = Math.max(0, idx[0] - CONTEXT_LINES);
  let end = Math.min(lines.length - 1, idx[0] + CONTEXT_LINES);
  for (let k = 1; k < idx.length; k++) {
    const s = Math.max(0, idx[k] - CONTEXT_LINES);
    const e = Math.min(lines.length - 1, idx[k] + CONTEXT_LINES);
    if (s <= end + 1) {
      end = Math.max(end, e);
    } else {
      windows.push([start, end]);
      start = s;
      end = e;
    }
  }
  windows.push([start, end]);
  return windows.map(([s, e]) => ({ lines: lines.slice(s, e + 1) }));
}

function capHunks(hunks: Hunk[]): { hunks: Hunk[]; truncated: boolean } {
  let count = 0;
  const out: Hunk[] = [];
  for (const h of hunks) {
    if (count + h.lines.length <= MAX_DIFF_LINES) {
      out.push(h);
      count += h.lines.length;
    } else {
      const room = MAX_DIFF_LINES - count;
      if (room > 0) out.push({ lines: h.lines.slice(0, room) });
      return { hunks: out, truncated: true };
    }
  }
  return { hunks: out, truncated: false };
}

async function mapPool<T, R>(
  items: T[],
  n: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const k = i++;
      out[k] = await fn(items[k]);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(n, Math.max(items.length, 1)) }, worker)
  );
  return out;
}

/**
 * GET /api/workspaces/[id]/diff — GitHub-style diff of agent changes vs the
 * GitHub base SHA (owner only). Same file set as the export: files touched by
 * agents, plus deleted files recovered from the edits log.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const ws = await getWorkspaceForUser(id, user.id);
  if (!ws) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!user.github_token) {
    return NextResponse.json(
      { error: "GitHub token missing. Please sign in again." },
      { status: 400 }
    );
  }

  const db = supabaseAdmin();

  // Files agents touched (same filter as the export).
  const { data: fileRows, error: fileErr } = await db
    .from("workspace_files")
    .select("path, content")
    .eq("workspace_id", id)
    .not("updated_by_agent", "is", null);
  if (fileErr) return NextResponse.json({ error: fileErr.message }, { status: 500 });
  const wsFiles = new Map<string, string>(
    ((fileRows ?? []) as { path: string; content: string }[]).map((f) => [
      f.path,
      f.content,
    ])
  );

  // Deleted files: hard-deleted from workspace_files, but edits keeps the path.
  const { data: editRows } = await db
    .from("edits")
    .select("path")
    .eq("workspace_id", id);
  const deletedPaths = [
    ...new Set(
      ((editRows ?? []) as { path: string }[])
        .map((e) => e.path)
        .filter((p) => !wsFiles.has(p))
    ),
  ];

  const paths = [...wsFiles.keys(), ...deletedPaths].sort();
  const token = user.github_token;
  const repo = ws.github_repo;
  const baseSha = ws.github_base_sha;

  let baseContents: (string | null)[];
  try {
    baseContents = baseSha
      ? await mapPool(paths, FETCH_CONCURRENCY, (p) =>
          fetchBaseContent(token, repo, baseSha, p)
        )
      : paths.map(() => null);
  } catch (e) {
    const message = e instanceof Error ? e.message : "GitHub fetch failed.";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  const files: FileDiff[] = [];
  for (let i = 0; i < paths.length; i++) {
    const path = paths[i];
    const current = wsFiles.has(path) ? wsFiles.get(path)! : null;
    const base = baseContents[i];

    if (current === null && base === null) continue;

    let status: FileDiff["status"];
    if (current !== null && base === null) status = "added";
    else if (current === null) status = "deleted";
    else status = "modified";

    const tooLarge =
      (current !== null && Buffer.byteLength(current, "utf8") > MAX_FILE_BYTES) ||
      (base !== null && Buffer.byteLength(base, "utf8") > MAX_FILE_BYTES);
    const binary =
      !tooLarge &&
      ((current !== null && isBinary(current)) ||
        (base !== null && isBinary(base)));

    if (tooLarge) {
      files.push({ path, status, additions: 0, deletions: 0, hunks: [], tooLarge: true });
      continue;
    }
    if (binary) {
      files.push({ path, status, additions: 0, deletions: 0, hunks: [], binary: true });
      continue;
    }

    const lines = toLines(base ?? "", current ?? "");
    const additions = lines.filter((l) => l.type === "add").length;
    const deletions = lines.filter((l) => l.type === "del").length;
    // Identical content (e.g. agent rewrote the same bytes) — not a change.
    if (additions === 0 && deletions === 0) continue;
    const capped = capHunks(toHunks(lines));
    files.push({
      path,
      status,
      additions,
      deletions,
      hunks: capped.hunks,
      ...(capped.truncated ? { truncated: true as const } : {}),
    });
  }

  return NextResponse.json(files);
}
