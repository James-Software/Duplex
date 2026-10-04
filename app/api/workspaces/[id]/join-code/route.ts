import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { ensureMemberRow, getViewerAccess, rotateMemberJoinCode } from "@/lib/access";

/** GET /api/workspaces/[id]/join-code — the CALLER's own join code.
 *  Every member (owner included) has their own code; agents join with a
 *  member's code and that member approves them. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const access = await getViewerAccess(id, user);
  if (!access) return NextResponse.json({ error: "not found" }, { status: 404 });
  const member = access.member ?? (await ensureMemberRow(id, user.github_username));
  return NextResponse.json({
    join_code: member.join_code,
    join_code_expires_at: member.join_code_expires_at,
  });
}

/** POST /api/workspaces/[id]/join-code — issue the caller a fresh join code. */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const access = await getViewerAccess(id, user);
  if (!access) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (access.workspace.status !== "active") {
    return NextResponse.json({ error: "Workspace is not active." }, { status: 400 });
  }
  try {
    const member = access.member ?? (await ensureMemberRow(id, user.github_username));
    const rotated = await rotateMemberJoinCode(member.id);
    return NextResponse.json({
      member: {
        join_code: rotated.join_code,
        join_code_expires_at: rotated.join_code_expires_at,
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not regenerate join code.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
