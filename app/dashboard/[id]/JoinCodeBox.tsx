"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export default function JoinCodeBox({
  workspaceId,
  code,
  expires,
  onRegenerated,
  autoRegenerate = true,
}: {
  workspaceId: string;
  code: string;
  expires: string;
  onRegenerated: (newCode: string, newExpires: string) => void;
  /** Only true for active sessions — finalized workspaces never auto-regen. */
  autoRegenerate?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  // Guards the auto-regen path against double-firing (timeout + manual click).
  const busyRef = useRef(false);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Always call the latest onRegenerated without making it an effect dep.
  const onRegeneratedRef = useRef(onRegenerated);
  useEffect(() => {
    onRegeneratedRef.current = onRegenerated;
  });

  const postRegenerate = useCallback(async () => {
    const res = await fetch(`/api/workspaces/${workspaceId}/join-code`, {
      method: "POST",
      credentials: "same-origin",
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? "Failed.");
    onRegeneratedRef.current(
      json.workspace.join_code,
      json.workspace.join_code_expires_at
    );
  }, [workspaceId]);

  async function regenerate() {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      await postRegenerate();
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  // Auto-regenerate when the code expires — no manual click needed.
  useEffect(() => {
    if (!autoRegenerate) return;
    const fire = async (allowRetry: boolean) => {
      if (busyRef.current) return;
      busyRef.current = true;
      try {
        await postRegenerate();
      } catch {
        // Don't tight-loop on failure: a single retry in 30s; the manual
        // button remains as fallback.
        if (allowRetry) retryTimer.current = setTimeout(() => fire(false), 30_000);
      } finally {
        busyRef.current = false;
      }
    };
    const delay = Math.max(new Date(expires).getTime() - Date.now(), 0);
    const t = setTimeout(() => fire(true), delay);
    return () => {
      clearTimeout(t);
      if (retryTimer.current) {
        clearTimeout(retryTimer.current);
        retryTimer.current = null;
      }
    };
  }, [expires, workspaceId, autoRegenerate, postRegenerate]);

  async function copy() {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const [now] = useState(() => Date.now());
  const expired = new Date(expires).getTime() < now;

  return (
    <div className="mt-5">
      <div className="flex flex-wrap items-center gap-3">
        <code className="rounded-xl border border-accent-line bg-accent-soft px-5 py-3 font-mono text-2xl font-bold tracking-widest text-accent-dark">
          {code}
        </code>
        <button
          onClick={copy}
          className="btn rounded-full border border-line px-4 py-2 text-sm font-medium hover:border-ink"
        >
          {copied ? "Copied" : "Copy"}
        </button>
        <button
          onClick={regenerate}
          disabled={busy}
          className="btn rounded-full border border-line px-4 py-2 text-sm font-medium hover:border-ink disabled:opacity-50"
        >
          {busy ? "…" : "Regenerate"}
        </button>
      </div>
      <p className="mt-2 text-xs text-faint">
        {expired ? (
          <span className="font-medium text-red-600">Expired — regenerate it</span>
        ) : (
          <>
            Expires at {new Date(expires).toLocaleTimeString()} · a fresh code is
            issued when an agent joins
          </>
        )}
      </p>
    </div>
  );
}
