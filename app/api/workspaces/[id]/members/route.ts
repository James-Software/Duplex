import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { ensureMemberRow, getViewerAccess, normalizeGithubUsername } from "@/lib/access";
import { githubApi } from "@/lib/github";
import { supabaseAdmin } from "@/lib/supabase";

const GITHUB_USERNAME_PATTERN = /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?$/;

async function ownerUsername(workspaceId: string, createdBy: string): Promise<string> {
  const { data } = await supabaseAdmin()
    .from("users")
    .select("github_username")
    .eq("id", createdBy)
    .single();
  return ((data as { github_username: string } | null)?.github_username ?? "").trim().toLowerCase();
}

/** GET /api/workspaces/[id]/members — list workspace members (owner or member). */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const access = await getViewerAccess(id, user);
  if (!access) return NextResponse.json({ error: "not found" }, { status: 404 });
  const ownerUname = await ownerUsername(id, access.workspace.created_by);
  const { data, error } = await supabaseAdmin()
    .from("workspace_members")
    .select("id, github_username, created_at")
    .eq("workspace_id", id)
    .order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const members = ((data ?? []) as { id: string; github_username: string; created_at: string }[]).map(
    (m) => ({ ...m, isOwner: m.github_username === ownerUname })
  );
  return NextResponse.json({ members });
}

/** POST /api/workspaces/[id]/members — add a member by GitHub username (owner only).
 *  Body: { github_username } */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const access = await getViewerAccess(id, user);
  if (!access) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!access.isOwner) {
    return NextResponse.json({ error: "Only the workspace owner can add members." }, { status: 403 });
  }
  if (access.workspace.status !== "active") {
    return NextResponse.json({ error: "Workspace is not active." }, { status: 400 });
  }
  let body: { github_username?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const raw = (body.github_username ?? "").trim();
  if (!GITHUB_USERNAME_PATTERN.test(raw)) {
    return NextResponse.json({ error: "That doesn't look like a GitHub username." }, { status: 400 });
  }
  const uname = normalizeGithubUsername(raw);
  const ownerUname = await ownerUsername(id, access.workspace.created_by);
  if (uname === ownerUname) {
    return NextResponse.json({ error: "That user already owns this workspace." }, { status: 400 });
  }
  // Verify the GitHub user exists before granting access.
  if (!user.github_token) {
    return NextResponse.json({ error: "GitHub token missing. Please sign in again." }, { status: 400 });
  }
  try {
    await githubApi(user.github_token, `/users/${encodeURIComponent(raw)}`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg.includes("404")) {
      return NextResponse.json({ error: `GitHub user "${raw}" not found.` }, { status: 404 });
    }
    return NextResponse.json({ error: "Could not verify that GitHub user. Try again." }, { status: 502 });
  }
  try {
    const member = await ensureMemberRow(id, uname);
    return NextResponse.json(
      { member: { id: member.id, github_username: member.github_username, isOwner: false } },
      { status: 201 }
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not add member.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** DELETE /api/workspaces/[id]/members — remove a member (owner only).
 *  Body: { github_username }. Their join code dies with the row; agents that
 *  joined with it keep member_id -> null (owner-approvable). */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const access = await getViewerAccess(id, user);
  if (!access) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!access.isOwner) {
    return NextResponse.json({ error: "Only the workspace owner can remove members." }, { status: 403 });
  }
  let body: { github_username?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const uname = normalizeGithubUsername(body.github_username ?? "");
  if (!uname) return NextResponse.json({ error: "Missing github_username." }, { status: 400 });
  const ownerUname = await ownerUsername(id, access.workspace.created_by);
  if (uname === ownerUname) {
    return NextResponse.json({ error: "The owner can't be removed." }, { status: 400 });
  }
  const { data, error } = await supabaseAdmin()
    .from("workspace_members")
    .delete()
    .eq("workspace_id", id)
    .eq("github_username", uname)
    .select("id");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data || data.length === 0) {
    return NextResponse.json({ error: "Member not found." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
