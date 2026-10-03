"use client";

import { useEffect, useState } from "react";

interface Agent {
  id: string;
  name: string;
  client_type: string;
  username_label: string | null;
  status: "pending" | "active" | "offline";
  current_path: string | null;
  current_task: string | null;
  last_seen: string | null;
}

interface FeedItem {
  id: string;
  ts: string;
  kind: "join" | "edit" | "message" | "claim";
  actor: string;
  text: string;
}

const KIND_DOT: Record<FeedItem["kind"], string> = {
  join: "bg-accent",
  edit: "bg-neutral-400",
  message: "bg-accent-dark",
  claim: "bg-amber-500",
};

function timeOf(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour12: false });
}

export default function WorkspaceLive({ workspaceId }: { workspaceId: string }) {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [ownerGithubId, setOwnerGithubId] = useState<number | null>(null);
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const avatarUrl = ownerGithubId
    ? `https://avatars.githubusercontent.com/u/${ownerGithubId}?v=4&s=64`
    : null;

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const [teamRes, feedRes] = await Promise.all([
          fetch(`/api/workspaces/${workspaceId}/team`, { credentials: "same-origin" }),
          fetch(`/api/workspaces/${workspaceId}/feed`, { credentials: "same-origin" }),
        ]);
        if (cancelled) return;
        if (teamRes.ok) {
          const json = await teamRes.json();
          setAgents((json.agents ?? []) as Agent[]);
          if (typeof json.owner_github_id === "number") setOwnerGithubId(json.owner_github_id);
        }
        if (feedRes.ok) setFeed(((await feedRes.json()).feed ?? []) as FeedItem[]);
      } catch {
        /* transient network hiccup — next poll retries */
      }
    }

    poll();
    const t = setInterval(poll, 2500);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [workspaceId]);

  async function refresh() {
    try {
      const [teamRes, feedRes] = await Promise.all([
        fetch(`/api/workspaces/${workspaceId}/team`, { credentials: "same-origin" }),
        fetch(`/api/workspaces/${workspaceId}/feed`, { credentials: "same-origin" }),
      ]);
      if (teamRes.ok) {
        const json = await teamRes.json();
        setAgents((json.agents ?? []) as Agent[]);
        if (typeof json.owner_github_id === "number") setOwnerGithubId(json.owner_github_id);
      }
      if (feedRes.ok) setFeed(((await feedRes.json()).feed ?? []) as FeedItem[]);
    } catch {
      /* transient network hiccup */
    }
  }

  async function decide(agentId: string, action: "approve" | "decline") {
    setBusy(agentId + action);
    try {
      await fetch(`/api/workspaces/${workspaceId}/team`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agent_id: agentId, action }),
      });
      await refresh();
    } finally {
      setBusy(null);
    }
  }

  const pending = agents.filter((a) => a.status === "pending");
  const active = agents.filter((a) => a.status === "active");

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* Team */}
      <section className="rounded-2xl border border-line bg-card p-6">
        <h2 className="font-display text-base font-semibold">
          Team{" "}
          <span className="font-mono text-xs font-normal text-faint">
            {active.length} active{pending.length > 0 && ` · ${pending.length} waiting`}
          </span>
        </h2>

        {pending.length > 0 && (
          <div className="mt-4 space-y-2">
            {pending.map((a) => (
              <div
                key={a.id}
                className="flex items-center justify-between rounded-xl border border-accent-line bg-accent-soft px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  {avatarUrl && (
                    <img src={avatarUrl} alt="" className="h-7 w-7 rounded-full" />
                  )}
                  <div>
                    <p className="text-sm font-medium">
                      {a.name}
                      <span className="ml-2 font-mono text-xs text-muted">{a.client_type}</span>
                    </p>
                    {a.username_label && (
                      <p className="font-mono text-xs text-muted">@{a.username_label}</p>
                    )}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => decide(a.id, "approve")}
                    disabled={busy !== null}
                    className="btn rounded-full bg-accent px-4 py-1.5 text-sm font-semibold text-white hover:bg-accent-dark disabled:opacity-50"
                  >
                    {busy === a.id + "approve" ? "…" : "Accept"}
                  </button>
                  <button
                    onClick={() => decide(a.id, "decline")}
                    disabled={busy !== null}
                    className="btn rounded-full border border-line px-4 py-1.5 text-sm font-medium hover:border-ink disabled:opacity-50"
                  >
                    Decline
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-4 space-y-2">
          {active.map((a) => (
            <div
              key={a.id}
              className="flex items-center justify-between rounded-xl border border-line px-4 py-3"
            >
              <div className="flex items-center gap-3">
                <span className="h-2 w-2 rounded-full bg-accent" aria-label="active" />
                {avatarUrl && (
                  <img src={avatarUrl} alt="" className="h-7 w-7 rounded-full" />
                )}
                <div>
                  <p className="text-sm font-medium">
                    {a.name}
                    {a.username_label && (
                      <span className="ml-2 font-mono text-xs text-muted">@{a.username_label}</span>
                    )}
                  </p>
                  {a.current_path && (
                    <p className="font-mono text-xs text-faint">{a.current_path}</p>
                  )}
                </div>
              </div>
              <span className="font-mono text-xs text-faint">{a.client_type}</span>
            </div>
          ))}
          {active.length === 0 && pending.length === 0 && (
            <p className="rounded-xl border border-dashed border-line p-6 text-center text-sm text-faint">
              No agents yet — share the connect prompt below.
            </p>
          )}
        </div>
      </section>

      {/* Activity feed */}
      <section className="rounded-2xl border border-line bg-card p-6">
        <h2 className="font-display text-base font-semibold">
          Activity <span className="font-mono text-xs font-normal text-faint">live</span>
        </h2>
        <ul className="mt-4 max-h-96 space-y-3 overflow-y-auto pr-1">
          {feed.map((item) => (
            <li key={item.id} className="flex items-start gap-3 text-sm">
              <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${KIND_DOT[item.kind]}`} />
              <div className="min-w-0">
                <p className="break-words text-ink">{item.text}</p>
                <p className="font-mono text-xs text-faint">{timeOf(item.ts)}</p>
              </div>
            </li>
          ))}
          {feed.length === 0 && (
            <li className="rounded-xl border border-dashed border-line p-6 text-center text-sm text-faint">
              Nothing yet — activity appears here the moment agents act.
            </li>
          )}
        </ul>
      </section>
    </div>
  );
}
