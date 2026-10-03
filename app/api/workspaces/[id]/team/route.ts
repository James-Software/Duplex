import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getWorkspaceForUser } from "@/lib/workspaces";
import { supabaseAdmin } from "@/lib/supabase";
import { isRecentlyActive, newSessionToken } from "@/lib/mcp/util";

async function ownedWorkspace(workspaceId: string, userId: string) {
  const ws = await getWorkspaceForUser(workspaceId, userId);
  return ws;
}

/** GET /api/workspaces/[id]/team — agents in the workspace (owner only). */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  if (!(await ownedWorkspace(id, user.id))) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const { data, error } = await supabaseAdmin()
    .from("agents")
    .select("id, name, client_type, username_label, status, current_path, current_task, last_seen, created_at")
    .eq("workspace_id", id)
    .order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  // "Editing" is driven by real edit history, not agent activity: an agent
  // shows as editing the path of its most recent edit, only within the
  // 5-minute activity window — same rule as get_team_status.
  const { data: editRows } = await supabaseAdmin()
    .from("edits")
    .select("agent_id, path, created_at")
    .eq("workspace_id", id)
    .order("created_at", { ascending: false })
    .limit(1000);
  const latestEditByAgent = new Map<string, { path: string; created_at: string }>();
  for (const e of (editRows ?? []) as { agent_id: string; path: string; created_at: string }[]) {
    if (!latestEditByAgent.has(e.agent_id)) latestEditByAgent.set(e.agent_id, e);
  }
  const agents = ((data ?? []) as { id: string; current_path: string | null }[]).map((a) => {
    const lastEdit = latestEditByAgent.get(a.id);
    return {
      ...a,
      current_path: lastEdit && isRecentlyActive(lastEdit.created_at) ? lastEdit.path : null,
    };
  });
  return NextResponse.json({ agents, owner_github_id: user.github_id });
}

/** POST /api/workspaces/[id]/team — approve, decline, or kick an agent.
 *  Body: { agent_id, action: "approve" | "decline" | "kick" } */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  if (!(await ownedWorkspace(id, user.id))) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  let body: { agent_id?: string; action?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const db = supabaseAdmin();
  const { data: agent } = await db
    .from("agents")
    .select("id, workspace_id, status")
    .eq("id", body.agent_id ?? "")
    .eq("workspace_id", id)
    .single();
  if (!agent) return NextResponse.json({ error: "Agent not found." }, { status: 404 });

  if (body.action === "approve") {
    const { error } = await db
      .from("agents")
      .update({
        status: "active",
        session_token: newSessionToken(),
        last_seen: new Date().toISOString(),
      })
      .eq("id", (agent as { id: string }).id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }
  if (body.action === "decline") {
    const { error } = await db.from("agents").delete().eq("id", (agent as { id: string }).id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }
  if (body.action === "kick") {
    if ((agent as { status: string }).status !== "active") {
      return NextResponse.json({ error: "Only active agents can be removed." }, { status: 400 });
    }
    const agentId = (agent as { id: string }).id;
    // Lock the agent out instantly (requireAgent rejects non-"active"
    // statuses) and free their file locks immediately.
    const { error } = await db
      .from("agents")
      .update({ status: "removed", session_token: null })
      .eq("id", agentId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await db.from("claims").delete().eq("agent_id", agentId);
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: 'action must be "approve", "decline", or "kick".' }, { status: 400 });
}
