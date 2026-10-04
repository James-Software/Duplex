"use client";

import { useEffect, useState } from "react";

interface Member {
  id: string;
  github_username: string;
  isOwner: boolean;
}

function Avatar({ username, size }: { username: string; size: string }) {
  const [imgOk, setImgOk] = useState(true);
  const initial = (username.trim().charAt(0) || "?").toUpperCase();
  if (imgOk) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={`https://github.com/${username}.png?size=64`}
        alt=""
        onError={() => setImgOk(false)}
        className={`${size} rounded-full border border-line`}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className={`${size} flex items-center justify-center rounded-full border border-line bg-accent-soft font-display text-sm font-semibold text-accent-dark`}
    >
      {initial}
    </span>
  );
}

/** Share card: the owner adds members by GitHub username; everyone sees the list. */
export default function MembersCard({
  workspaceId,
  isOwner,
  viewerUsername,
}: {
  workspaceId: string;
  isOwner: boolean;
  viewerUsername: string;
}) {
  const [members, setMembers] = useState<Member[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/members`, {
        credentials: "same-origin",
      });
      if (res.ok) setMembers(((await res.json()).members ?? []) as Member[]);
    } catch {
      /* transient — next poll/render retries */
    }
  }

  useEffect(() => {
    let cancelled = false;
    async function initialLoad() {
      try {
        const res = await fetch(`/api/workspaces/${workspaceId}/members`, {
          credentials: "same-origin",
        });
        if (!cancelled && res.ok) setMembers(((await res.json()).members ?? []) as Member[]);
      } catch {
        /* transient — add/remove actions reload anyway */
      }
    }
    initialLoad();
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  async function add() {
    const uname = input.trim();
    if (!uname || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/members`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ github_username: uname }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not add member.");
      setInput("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add member.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(username: string) {
    if (removing) return;
    setRemoving(username);
    setError(null);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/members`, {
        method: "DELETE",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ github_username: username }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not remove member.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not remove member.");
    } finally {
      setRemoving(null);
    }
  }

  const self = viewerUsername.trim().toLowerCase();

  return (
    <div className="rounded-2xl border border-line bg-card p-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-sm font-semibold">Share</h2>
        <span className="font-mono text-xs text-faint">{members.length}</span>
      </div>
      <p className="mt-1 text-xs text-muted">
        Members sign in with GitHub, get their own join code, and approve their own agents.
      </p>

      {isOwner && (
        <div className="mt-3">
          <div className="flex items-center gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") add();
              }}
              placeholder="GitHub username"
              spellCheck={false}
              maxLength={39}
              aria-label="GitHub username to add"
              className="w-full rounded-lg border border-line bg-card px-3 py-1.5 text-sm text-ink placeholder:text-faint outline-none focus:border-accent"
            />
            <button
              onClick={add}
              disabled={busy || !input.trim()}
              className="btn shrink-0 rounded-full bg-accent px-4 py-1.5 text-sm font-semibold text-white hover:bg-accent-dark disabled:opacity-50"
            >
              {busy ? "…" : "Add"}
            </button>
          </div>
          {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
        </div>
      )}

      <ul className="mt-3 divide-y divide-line">
        {members.map((m) => {
          const isSelf = m.github_username.toLowerCase() === self;
          return (
            <li key={m.id} className="flex items-center justify-between py-2">
              <div className="flex items-center gap-2.5">
                <Avatar username={m.github_username} size="h-7 w-7" />
                <p className="text-sm font-medium">
                  @{m.github_username}
                  {isSelf && <span className="ml-2 text-xs font-normal text-faint">you</span>}
                </p>
                {m.isOwner && (
                  <span className="rounded-full bg-accent-soft px-2 py-0.5 font-mono text-[10px] font-medium text-accent-dark">
                    Owner
                  </span>
                )}
              </div>
              {isOwner && !m.isOwner && (
                <button
                  onClick={() => remove(m.github_username)}
                  disabled={removing !== null}
                  aria-label={`Remove @${m.github_username}`}
                  title="Remove member"
                  className="btn flex h-6 w-6 items-center justify-center rounded-full text-faint hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                >
                  {removing === m.github_username ? (
                    <span className="text-xs">…</span>
                  ) : (
                    <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="h-3 w-3" aria-hidden="true">
                      <path d="M2.5 2.5l7 7M9.5 2.5l-7 7" />
                    </svg>
                  )}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
