import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getWorkspaceForUser } from "@/lib/workspaces";
import { finalizeWorkspace } from "@/lib/export";

/**
 * POST /api/workspaces/[id]/finalize — freeze the workspace and export
 * to GitHub (branch + commits + PR). Owner only.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const ws = await getWorkspaceForUser(id, user.id);
  if (!ws) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (ws.status === "finalized") {
    return NextResponse.json({ error: "Workspace is already finalized." }, { status: 400 });
  }
  try {
    const result = await finalizeWorkspace(ws, user);
    return NextResponse.json({ result });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Export failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
