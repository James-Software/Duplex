import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { createWorkspace, getUserWorkspaces } from "@/lib/workspaces";

/** GET /api/workspaces — list my workspaces. */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const workspaces = await getUserWorkspaces(user.id);
  return NextResponse.json({ workspaces });
}

/** POST /api/workspaces — create a workspace. Body: { name, github_repo, github_base_branch? } */
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let body: { name?: string; github_repo?: string; github_base_branch?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  try {
    const workspace = await createWorkspace(user, {
      name: body.name ?? "",
      github_repo: body.github_repo ?? "",
      github_base_branch: body.github_base_branch,
    });
    return NextResponse.json({ workspace }, { status: 201 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not create workspace.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
