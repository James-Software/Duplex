import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getUserWorkspaces } from "@/lib/workspaces";
import { githubApi, type GitHubRepo } from "@/lib/github";
import RepoList from "./RepoList";

export default async function DashboardPage() {
  const user = await getSessionUser();
  if (!user) redirect("/");

  let repos: GitHubRepo[] = [];
  let reposError: string | null = null;
  if (!user.github_token) {
    reposError = "GitHub token missing — please sign out and sign in again.";
  } else {
    try {
      repos = (await githubApi(
        user.github_token,
        "/user/repos?per_page=100&sort=updated"
      )) as GitHubRepo[];
    } catch {
      reposError =
        "Could not load your repositories. Your GitHub token may have expired — try signing out and back in.";
    }
  }

  // One session per repo: map each repo to its active session, if any.
  const workspaces = await getUserWorkspaces(user.id);
  const sessions: Record<string, string> = {};
  for (const ws of workspaces) {
    if (ws.status === "active" && !sessions[ws.github_repo]) {
      sessions[ws.github_repo] = ws.id;
    }
  }

  return (
    <div className="min-h-full bg-wash text-ink">
      <header className="border-b border-line bg-card">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-6">
          <Link href="/" className="font-display text-xl font-bold tracking-tight">Duplex</Link>
          <div className="flex items-center gap-4">
            <span className="font-mono text-xs text-muted">@{user.github_username}</span>
            {/* Plain <a>: forces a full reload so no stale logged-in UI survives sign-out. */}
            <a
              href="/api/auth/logout"
              className="btn rounded-full border border-line px-4 py-2 text-sm font-medium hover:border-ink"
            >
              Sign out
            </a>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl px-6 py-10">
        <h1 className="font-display text-3xl font-bold tracking-tight">Repositories</h1>
        <p className="mt-1 text-sm text-muted">
          Every session is a GitHub repository — pick one to start collaborating.
        </p>

        <div className="mt-8">
          {reposError ? (
            <p className="rounded-2xl border border-dashed border-line p-8 text-center text-sm text-red-600">
              {reposError}
            </p>
          ) : (
            <RepoList repos={repos} sessions={sessions} />
          )}
        </div>
      </main>
    </div>
  );
}
