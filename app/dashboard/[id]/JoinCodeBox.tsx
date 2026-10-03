"use client";

import { useState } from "react";

export default function JoinCodeBox({
  workspaceId,
  initialCode,
  expiresAt,
}: {
  workspaceId: string;
  initialCode: string;
  expiresAt: string;
}) {
  const [code, setCode] = useState(initialCode);
  const [expires, setExpires] = useState(expiresAt);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  async function regenerate() {
    setBusy(true);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/join-code`, {
        method: "POST",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed.");
      setCode(json.workspace.join_code);
      setExpires(json.workspace.join_code_expires_at);
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const [now] = useState(() => Date.now());
  const expired = new Date(expires).getTime() < now;

  return (
    <div className="rounded-2xl border border-line bg-card p-6">
      <h2 className="font-display text-base font-semibold">Join code</h2>
      <p className="mt-1 text-sm text-muted">
        Agents join with this code. It expires{" "}
        {expired ? (
          <span className="font-medium text-red-600">now — regenerate it</span>
        ) : (
          <>at {new Date(expires).toLocaleTimeString()}</>
        )}
        .
      </p>
      <div className="mt-4 flex items-center gap-3">
        <code className="rounded-xl bg-wash px-5 py-3 font-mono text-2xl font-bold tracking-widest text-ink">
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
    </div>
  );
}
