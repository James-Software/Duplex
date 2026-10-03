"use client";

import { useState } from "react";

interface FinalizeResult {
  branch: string;
  prUrl: string | null;
  prNumber: number | null;
  commits: { sha: string; agentName: string; files: string[] }[];
  filesChanged: number;
}

export default function FinalizeBox({
  workspaceId,
  repo,
  finalized,
}: {
  workspaceId: string;
  repo: string;
  finalized: boolean;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<FinalizeResult | null>(null);

  async function finalize() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/finalize`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Export failed.");
      setResult(json.result as FinalizeResult);
      setConfirming(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed.");
    } finally {
      setBusy(false);
    }
  }

  if (finalized && !result) {
    return (
      <div className="rounded-2xl border border-line bg-card p-6">
        <h2 className="font-display text-base font-semibold">Export</h2>
        <p className="mt-1 text-sm text-muted">This workspace was already finalized.</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-line bg-card p-6">
      <h2 className="font-display text-base font-semibold">Export to GitHub</h2>
      <p className="mt-1 text-sm text-muted">
        Freezes the workspace and opens a PR on{" "}
        <span className="font-mono text-xs">{repo}</span> — one commit per agent,
        attributed to you, agent provenance in the trailers.
      </p>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      {result ? (
        <div className="mt-4 rounded-xl bg-accent-soft p-4">
          <p className="font-display text-sm font-semibold text-accent-dark">
            Exported
          </p>
          <dl className="mt-2 space-y-1 font-mono text-xs">
            <div className="flex gap-2">
              <dt className="text-muted">Branch:</dt>
              <dd>{result.branch}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-muted">Commits:</dt>
              <dd>{result.commits.length}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-muted">Files:</dt>
              <dd>{result.filesChanged}</dd>
            </div>
          </dl>
          {result.prUrl ? (
            <a
              href={result.prUrl}
              target="_blank"
              rel="noreferrer"
              className="btn mt-3 inline-block rounded-full bg-accent px-5 py-2 text-sm font-semibold text-white hover:bg-accent-dark"
            >
              View pull request #{result.prNumber}
            </a>
          ) : (
            <p className="mt-3 text-sm text-muted">
              Branch pushed — open the PR manually on GitHub.
            </p>
          )}
        </div>
      ) : confirming ? (
        <div className="mt-4 flex items-center gap-3">
          <p className="text-sm font-medium">Freeze the workspace and export?</p>
          <button
            onClick={finalize}
            disabled={busy}
            className="btn rounded-full bg-ink px-5 py-2 text-sm font-semibold text-white hover:bg-neutral-800 disabled:opacity-50"
          >
            {busy ? "Exporting…" : "Yes, finalize"}
          </button>
          <button
            onClick={() => setConfirming(false)}
            disabled={busy}
            className="btn rounded-full border border-line px-4 py-2 text-sm font-medium hover:border-ink disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          onClick={() => setConfirming(true)}
          className="btn mt-4 rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-white hover:bg-neutral-800"
        >
          Finalize & export
        </button>
      )}
    </div>
  );
}
