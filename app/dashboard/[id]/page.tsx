import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getWorkspaceForUser } from "@/lib/workspaces";
import { env } from "@/lib/env";
import ConnectSection from "./ConnectSection";
import WorkspaceLive from "./WorkspaceLive";
import FinalizeBox from "./FinalizeBox";

export default async function WorkspacePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/");
  const { id } = await params;
  const ws = await getWorkspaceForUser(id, user.id);
  if (!ws) notFound();

  return (
    <div className="min-h-full bg-wash text-ink">
      <header className="border-b border-line bg-card">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-6">
          <div className="flex items-center gap-4">
            <Link href="/dashboard" className="btn font-mono text-sm text-muted hover:text-ink">
              ←
            </Link>
            <span className="font-display text-xl font-bold tracking-tight">Duplex</span>
          </div>
          <span className="font-mono text-xs text-muted">@{user.github_username}</span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl px-6 py-10">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-3xl font-bold tracking-tight">{ws.name}</h1>
            <p className="mt-1 font-mono text-xs text-muted">
              {ws.id} · {ws.github_repo} · {ws.github_base_branch} @{" "}
              {ws.github_base_sha?.slice(0, 7)}
            </p>
          </div>
          <span
            className={`rounded-full px-2.5 py-1 font-mono text-xs ${
              ws.status === "active" ? "bg-accent-soft text-accent-dark" : "bg-neutral-100 text-muted"
            }`}
          >
            {ws.status}
          </span>
        </div>

        <div className="mt-8 grid gap-4">
          <ConnectSection
            workspaceId={ws.id}
            initialCode={ws.join_code}
            expiresAt={ws.join_code_expires_at}
            appUrl={env.appUrl()}
            username={user.github_username}
            workspaceName={ws.name}
            active={ws.status === "active"}
          />
          <WorkspaceLive workspaceId={ws.id} />
          <FinalizeBox workspaceId={ws.id} finalized={ws.status === "finalized"} />
        </div>
      </main>
    </div>
  );
}
