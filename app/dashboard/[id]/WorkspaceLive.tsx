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
  edit: "bg-neutral-300",
  message: "bg-accent-dark",
  claim: "bg-neutral-400",
};

function timeOf(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour12: false });
}

export default function WorkspaceLive({ workspaceId }: { workspaceId: string }) {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [ownerGithubId, setOwnerGithubId] = useState<number | null>(null);
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [kickTarget, setKickTarget] = useState<Agent | null>(null);
  const [kickBusy, setKickBusy] = useState(false);

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

  async function kick(agentId: string) {
    setKickBusy(true);
    try {
      await fetch(`/api/workspaces/${workspaceId}/team`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agent_id: agentId, action: "kick" }),
      });
      setKickTarget(null);
      await refresh();
    } finally {
      setKickBusy(false);
    }
  }

  const pending = agents.filter((a) => a.status === "pending");
  const active = agents.filter((a) => a.status === "active");

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* Team — open rows, no card; dividers do the structure work */}
      <section>
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

        <div className="mt-2 divide-y divide-line">
          {active.map((a) => (
            <div
              key={a.id}
              className="flex items-center justify-between py-3"
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
                  {a.current_task && (
                    <p className="text-xs text-muted">{a.current_task}</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs text-faint">{a.client_type}</span>
                <button
                  onClick={() => setKickTarget(a)}
                  aria-label={`Remove ${a.name}`}
                  title="Remove agent"
                  className="btn flex h-6 w-6 items-center justify-center rounded-full text-faint hover:bg-red-50 hover:text-red-600"
                >
                  <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="h-3 w-3" aria-hidden="true">
                    <path d="M2.5 2.5l7 7M9.5 2.5l-7 7" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
          {active.length === 0 && pending.length === 0 && (
            <p className="rounded-xl border border-dashed border-line p-6 text-center text-sm text-faint">
              No agents yet. Share the connect prompt above.
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
              Nothing yet. Activity appears here the moment agents act.
            </li>
          )}
        </ul>
      </section>

      {/* Kick confirmation */}
      {kickTarget && (
        <KickConfirmModal
          name={kickTarget.name}
          busy={kickBusy}
          onCancel={() => {
            if (!kickBusy) setKickTarget(null);
          }}
          onConfirm={() => kick(kickTarget.id)}
        />
      )}
    </div>
  );
}

function KickConfirmModal({
  name,
  busy,
  onCancel,
  onConfirm,
}: {
  name: string;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onCancel]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="kick-dialog-title"
    >
      <div
        className="absolute inset-0 bg-black/40 motion-safe:animate-[modal-in_150ms_ease-out]"
        onClick={() => {
          if (!busy) onCancel();
        }}
      />
      <div className="relative w-full max-w-sm rounded-2xl bg-card p-6 shadow-xl motion-safe:animate-[modal-in_150ms_ease-out]">
        <h3 id="kick-dialog-title" className="font-display text-lg font-semibold">
          Remove {name} from the session?
        </h3>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          They lose access immediately and their file locks are released.
        </p>
        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={onCancel}
            disabled={busy}
            className="btn rounded-full border border-line px-4 py-2 text-sm font-medium hover:border-ink disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={busy}
            className="btn rounded-full bg-red-600 px-5 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
          >
            {busy ? "Removing…" : "Remove"}
          </button>
        </div>
      </div>
    </div>
  );
}
