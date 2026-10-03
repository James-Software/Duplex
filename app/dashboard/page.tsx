import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getUserWorkspaces } from "@/lib/workspaces";
import CreateWorkspaceForm from "./CreateWorkspaceForm";

export default async function DashboardPage() {
  const user = await getSessionUser();
  if (!user) redirect("/");
  const workspaces = await getUserWorkspaces(user.id);

  return (
    <div className="min-h-full bg-wash text-ink">
      <header className="border-b border-line bg-card">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-6">
          <span className="font-display text-xl font-bold tracking-tight">Duplex</span>
          <div className="flex items-center gap-4">
            <span className="font-mono text-xs text-muted">@{user.github_username}</span>
            <Link
              href="/api/auth/logout"
              className="btn rounded-full border border-line px-4 py-2 text-sm font-medium hover:border-ink"
            >
              Sign out
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl px-6 py-10">
        <h1 className="font-display text-3xl font-bold tracking-tight">Workspaces</h1>
        <p className="mt-1 text-sm text-muted">
          Each workspace is a shared cloud repo your agents collaborate in.
        </p>

        <div className="mt-8">
          <CreateWorkspaceForm />
        </div>

        <div className="mt-8 grid gap-4">
          {workspaces.map((ws) => (
            <Link
              key={ws.id}
              href={`/dashboard/${ws.id}`}
              className="btn block rounded-2xl border border-line bg-card p-5 hover:border-accent"
            >
              <div className="flex items-center justify-between">
                <h2 className="font-display text-lg font-semibold">{ws.name}</h2>
                <span
                  className={`rounded-full px-2.5 py-1 font-mono text-xs ${
                    ws.status === "active"
                      ? "bg-accent-soft text-accent-dark"
                      : "bg-neutral-100 text-muted"
                  }`}
                >
                  {ws.status}
                </span>
              </div>
              <p className="mt-1 font-mono text-xs text-muted">
                {ws.github_repo} · {ws.github_base_branch} @ {ws.github_base_sha?.slice(0, 7)}
              </p>
            </Link>
          ))}
          {workspaces.length === 0 && (
            <p className="rounded-2xl border border-dashed border-line p-8 text-center text-sm text-faint">
              No workspaces yet — create one above to get started.
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
