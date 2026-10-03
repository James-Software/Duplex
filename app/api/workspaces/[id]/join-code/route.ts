import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getWorkspaceForUser, regenerateJoinCode } from "@/lib/workspaces";

/** GET /api/workspaces/[id]/join-code — current join code (owner only). */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const ws = await getWorkspaceForUser(id, user.id);
  if (!ws) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({
    join_code: ws.join_code,
    join_code_expires_at: ws.join_code_expires_at,
  });
}

/** POST /api/workspaces/[id]/join-code — issue a fresh join code. */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  try {
    const workspace = await regenerateJoinCode(id, user.id);
    return NextResponse.json({ workspace });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not regenerate join code.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
