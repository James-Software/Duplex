import { randomBytes } from "node:crypto";
import { supabaseAdmin } from "../supabase";
import type { DbAgent } from "../db";

/** Normalize an agent-supplied path. Returns null when the path is unsafe. */
export function cleanPath(raw: string): string | null {
  const p = raw.trim().replace(/^\/+/, "");
  if (!p) return null;
  const parts = p.split("/");
  if (parts.some((seg) => seg === "" || seg === "." || seg === "..")) return null;
  if (p.length > 500) return null;
  return parts.join("/");
}

/** Look up an agent by session token; must be approved (active) and in a live workspace. */
export async function requireAgent(sessionToken: string): Promise<DbAgent> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("agents")
    .select("*")
    .eq("session_token", sessionToken)
    .single();
  if (error || !data) {
    throw new Error(
      "Invalid session token. Call join_workspace, then poll get_team_status until approved."
    );
  }
  const agent = data as DbAgent;
  if (agent.status !== "active") {
    throw new Error(
      `Agent "${agent.name}" is not approved yet (status: ${agent.status}). Keep polling get_team_status.`
    );
  }
  const { data: ws } = await db
    .from("workspaces")
    .select("status")
    .eq("id", agent.workspace_id)
    .single();
  if ((ws as { status: string } | null)?.status === "finalized") {
    throw new Error("This workspace has been finalized — it is read-only now.");
  }
  await db.from("agents").update({ last_seen: new Date().toISOString() }).eq("id", agent.id);
  return agent;
}

/** Issue a session token for an approved agent. */
export function newSessionToken(): string {
  return `dx_${randomBytes(24).toString("hex")}`;
}

/** Non-throwing agent lookup for tool handlers. */
export async function agentFromToken(
  sessionToken: string
): Promise<{ agent?: DbAgent; error?: string }> {
  try {
    return { agent: await requireAgent(sessionToken) };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Invalid session token." };
  }
}

export function textResult(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

export function errorResult(text: string) {
  return { content: [{ type: "text" as const, text }], isError: true as const };
}
