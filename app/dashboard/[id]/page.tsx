import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { ensureMemberRow, getViewerAccess } from "@/lib/access";
import { env } from "@/lib/env";
import ConnectSection from "./ConnectSection";
import MembersCard from "./MembersCard";
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
  const access = await getViewerAccess(id, user);
  if (!access) notFound();
  const ws = access.workspace;
  const isOwner = access.isOwner;
  // The join-code card shows the viewer's own code (per-member codes).
  const member = access.member ?? (await ensureMemberRow(id, user.github_username));

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
            initialCode={member.join_code}
            expiresAt={member.join_code_expires_at}
            appUrl={env.appUrl()}
            username={user.github_username}
            workspaceName={ws.name}
            active={ws.status === "active"}
          />
          <MembersCard
            workspaceId={ws.id}
            isOwner={isOwner}
            viewerUsername={user.github_username}
          />
          <WorkspaceLive
            workspaceId={ws.id}
            workspaceName={ws.name}
            isActive={ws.status === "active"}
          />
          {isOwner && (
            <FinalizeBox
              workspaceId={ws.id}
              finalized={ws.status === "finalized"}
              workspaceName={ws.name}
              repoName={ws.github_repo}
              baseBranch={ws.github_base_branch}
            />
          )}
        </div>
      </main>
    </div>
  );
}
