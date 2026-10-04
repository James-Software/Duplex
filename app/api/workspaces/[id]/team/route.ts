import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getViewerAccess } from "@/lib/access";
import { supabaseAdmin } from "@/lib/supabase";
import { isRecentlyActive, newSessionToken } from "@/lib/mcp/util";

/** GET /api/workspaces/[id]/team — agents in the workspace (owner or member).
 *  Everybody sees everybody's agents; each agent is annotated with the
 *  GitHub username of the member whose join code it joined with. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const access = await getViewerAccess(id, user);
  if (!access) return NextResponse.json({ error: "not found" }, { status: 404 });
  const { data, error } = await supabaseAdmin()
    .from("agents")
    .select("id, name, client_type, username_label, status, current_path, current_task, last_seen, created_at, member_id")
    .eq("workspace_id", id)
    .order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const { data: memberRows } = await supabaseAdmin()
    .from("workspace_members")
    .select("id, github_username")
    .eq("workspace_id", id);
  const approverByMemberId = new Map(
    ((memberRows ?? []) as { id: string; github_username: string }[]).map((m) => [
      m.id,
      m.github_username,
    ])
  );
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
  const agents = ((data ?? []) as { id: string; current_path: string | null; member_id: string | null }[]).map((a) => {
    const lastEdit = latestEditByAgent.get(a.id);
    return {
      ...a,
      current_path: lastEdit && isRecentlyActive(lastEdit.created_at) ? lastEdit.path : null,
      approver: a.member_id ? (approverByMemberId.get(a.member_id) ?? null) : null,
    };
  });
  return NextResponse.json({
    agents,
    viewer: {
      isOwner: access.isOwner,
      memberId: access.member?.id ?? null,
      githubUsername: user.github_username,
    },
    owner_github_id: user.github_id,
  });
}

/** POST /api/workspaces/[id]/team — approve, decline, or kick an agent.
 *  Body: { agent_id, action: "approve" | "decline" | "kick" }
 *  The owner may act on any agent; a member may act only on agents that
 *  joined with their own join code. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const access = await getViewerAccess(id, user);
  if (!access) return NextResponse.json({ error: "not found" }, { status: 404 });
  let body: { agent_id?: string; action?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const db = supabaseAdmin();
  const { data: agent } = await db
    .from("agents")
    .select("id, workspace_id, status, member_id")
    .eq("id", body.agent_id ?? "")
    .eq("workspace_id", id)
    .single();
  if (!agent) return NextResponse.json({ error: "Agent not found." }, { status: 404 });
  const agentRow = agent as { id: string; status: string; member_id: string | null };
  if (!access.isOwner) {
    if (!access.member || agentRow.member_id !== access.member.id) {
      return NextResponse.json(
        { error: "You can only manage agents that joined with your join code." },
        { status: 403 }
      );
    }
  }

  if (body.action === "approve") {
    const { error } = await db
      .from("agents")
      .update({
        status: "active",
        session_token: newSessionToken(),
        last_seen: new Date().toISOString(),
      })
      .eq("id", agentRow.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }
  if (body.action === "decline") {
    const { error } = await db.from("agents").delete().eq("id", agentRow.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }
  if (body.action === "kick") {
    if (agentRow.status !== "active") {
      return NextResponse.json({ error: "Only active agents can be removed." }, { status: 400 });
    }
    // Lock the agent out instantly (requireAgent rejects non-"active"
    // statuses) and free their file locks immediately.
    const { error } = await db
      .from("agents")
      .update({ status: "removed", session_token: null })
      .eq("id", agentRow.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await db.from("claims").delete().eq("agent_id", agentRow.id);
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: 'action must be "approve", "decline", or "kick".' }, { status: 400 });
}
