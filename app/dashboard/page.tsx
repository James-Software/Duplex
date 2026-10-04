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
    reposError = "GitHub token missing. Please sign out and sign in again.";
  } else {
    try {
      repos = (await githubApi(
        user.github_token,
        "/user/repos?per_page=100&sort=updated"
      )) as GitHubRepo[];
    } catch {
      reposError =
        "Could not load your repositories. Your GitHub token may have expired. Try signing out and back in.";
    }
  }

  // One session per repo: map each repo to its active session, if any.
  const workspaces = await getUserWorkspaces(user);
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
            <span className="flex items-center gap-2 font-mono text-xs text-muted">
              <img
                src={`https://avatars.githubusercontent.com/u/${user.github_id}?v=4&s=64`}
                alt=""
                className="h-5 w-5 rounded-full"
              />
              @{user.github_username}
            </span>
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
        <div className="flex items-center gap-3">
          <svg
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden="true"
            className="h-8 w-8 shrink-0 text-ink"
          >
            <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
          </svg>
          <h1 className="font-display text-3xl font-bold tracking-tight">Repositories</h1>
        </div>
        <p className="mt-1 text-sm text-muted">
          Every session is a GitHub repository. Pick one to start collaborating.
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
