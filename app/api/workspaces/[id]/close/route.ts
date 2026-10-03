import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getWorkspaceForUser } from "@/lib/workspaces";
import { supabaseAdmin } from "@/lib/supabase";

/**
 * POST /api/workspaces/[id]/close — permanently delete an active workspace
 * and all its cloud data (agents, files, edits, messages, claims via
 * ON DELETE CASCADE) without exporting anything to GitHub. Owner only.
 * The connected GitHub repo itself is never touched.
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
  if (ws.status !== "active") {
    return NextResponse.json(
      { error: "Only an active workspace can be closed." },
      { status: 400 }
    );
  }
  const { error } = await supabaseAdmin().from("workspaces").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ error: "Could not close workspace." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
