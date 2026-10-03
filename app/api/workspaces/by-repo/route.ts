import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getActiveWorkspaceByRepo } from "@/lib/workspaces";

/** GET /api/workspaces/by-repo?repo=owner/name — the active session for a repo, if any. */
export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const repo = new URL(request.url).searchParams.get("repo") ?? "";
  if (!repo) {
    return NextResponse.json({ error: "Missing ?repo=owner/name." }, { status: 400 });
  }
  const workspace = await getActiveWorkspaceByRepo(user.id, repo);
  return NextResponse.json({ workspace });
}
