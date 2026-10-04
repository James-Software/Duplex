import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getViewerAccess } from "@/lib/access";
import { supabaseAdmin } from "@/lib/supabase";

const DEEPSEEK_URL = "https://lacuna-resource.services.ai.azure.com/openai/v1/chat/completions";
const SUGGEST_TIMEOUT_MS = 15_000;

/** Clean a model completion into a safe single-line PR title. */
function sanitizeTitle(raw: string): string | null {
  let t = raw.split("\n")[0].trim();
  // Strip wrapping quotes.
  if (
    t.length >= 2 &&
    ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'")))
  ) {
    t = t.slice(1, -1).trim();
  }
  t = t.replace(/—/g, ",").replace(/\s+/g, " ").trim();
  if (!t) return null;
  return t.slice(0, 150);
}

/**
 * POST /api/workspaces/[id]/suggest-pr-title — AI-suggested PR title (owner only).
 * Uses DeepSeek's OpenAI-compatible API; the key stays server-side.
 * Returns { title: string | null } — null when the key is missing or the
 * call fails, so the UI falls back to the default title. Never throws.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    const { id } = await params;
    const access = await getViewerAccess(id, user);
    if (!access) return NextResponse.json({ error: "not found" }, { status: 404 });
    if (!access.isOwner) {
      return NextResponse.json({ error: "Only the workspace owner can finalize." }, { status: 403 });
    }
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) return NextResponse.json({ title: null, reason: "no_key" });

    // Same change summary the export uses: per-agent files changed + total.
    const db = supabaseAdmin();
    const ws = access.workspace;
    const { data: fileRows } = await db
      .from("workspace_files")
      .select("path, updated_by_agent")
      .eq("workspace_id", id)
      .not("updated_by_agent", "is", null);
    const files = (fileRows ?? []) as { path: string; updated_by_agent: string | null }[];
    if (files.length === 0) return NextResponse.json({ title: null, reason: "no_files" });
    const { data: agentRows } = await db
      .from("agents")
      .select("id, name")
      .eq("workspace_id", id);
    const nameById = new Map(
      ((agentRows ?? []) as { id: string; name: string }[]).map((a) => [a.id, a.name])
    );
    const byAgent = new Map<string, string[]>();
    for (const f of files) {
      const name = (f.updated_by_agent && nameById.get(f.updated_by_agent)) || "An agent";
      if (!byAgent.has(name)) byAgent.set(name, []);
      byAgent.get(name)!.push(f.path);
    }
    const parts = [...byAgent.entries()].map(
      ([name, paths]) =>
        `${name} changed ${paths.length} file${paths.length === 1 ? "" : "s"} (${paths.slice(0, 5).join(", ")})`
    );

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), SUGGEST_TIMEOUT_MS);
    try {
      const res = await fetch(DEEPSEEK_URL, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
          // Azure-hosted endpoints sometimes expect the classic api-key header
          // instead of (or in addition to) the Bearer scheme.
          "api-key": apiKey,
        },
        body: JSON.stringify({
          model: "Deepseek-V4.1-Flash",
          max_tokens: 60,
          temperature: 0.3,
          messages: [
            {
              role: "system",
              content:
                "You write concise pull request titles. Reply with ONLY the title: plain text, no em dashes, no surrounding quotes, under 70 characters.",
            },
            {
              role: "user",
              content: `Workspace "${ws.name}" in repo ${ws.github_repo}: ${files.length} files changed. ${parts.join("; ")}. Suggest a pull request title.`,
            },
          ],
        }),
      });
      clearTimeout(timer);
      if (!res.ok) {
        // Capture Azure's error body — it usually names the exact auth problem.
        // Error bodies never contain the key, so a short snippet is safe.
        let detail = "";
        try {
          detail = (await res.text()).replace(/\s+/g, " ").trim().slice(0, 180);
        } catch {
          detail = "";
        }
        return NextResponse.json({ title: null, reason: `api_${res.status}`, detail });
      }
      const json = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const raw = json.choices?.[0]?.message?.content ?? "";
      const title = sanitizeTitle(raw);
      return NextResponse.json({ title, reason: title ? undefined : "empty_response" });
    } catch (e) {
      clearTimeout(timer);
      const reason =
        e instanceof DOMException && e.name === "AbortError" ? "timeout" : "fetch_error";
      return NextResponse.json({ title: null, reason });
    }
  } catch {
    return NextResponse.json({ title: null, reason: "server_error" });
  }
}
