import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getViewerAccess } from "@/lib/access";
import { finalizeWorkspace } from "@/lib/export";

/**
 * POST /api/workspaces/[id]/finalize — freeze the workspace and export
 * to GitHub (branch + commits + PR). Owner only.
 * Body (optional): { prTitle?: string } — custom PR title, trimmed and
 * capped at 150 chars; falls back to "Duplex: {workspace name}".
 */
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
    return NextResponse.json(
      { error: "Only the workspace owner can finalize." },
      { status: 403 }
    );
  }
  const ws = access.workspace;
  if (ws.status === "finalized") {
    return NextResponse.json({ error: "Workspace is already finalized." }, { status: 400 });
  }
  let body: { prTitle?: string } = {};
  try {
    body = await request.json();
  } catch {
    // no body — fall back to the default title
  }
  const prTitle =
    typeof body.prTitle === "string" && body.prTitle.trim()
      ? body.prTitle.trim().slice(0, 150)
      : null;
  try {
    const result = await finalizeWorkspace(ws, user, prTitle);
    return NextResponse.json({ result });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Export failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
