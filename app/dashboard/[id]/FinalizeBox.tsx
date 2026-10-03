"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import CloseSessionModal from "../CloseSessionModal";

interface FinalizeResult {
  branch: string;
  prUrl: string | null;
  prNumber: number | null;
  commits: { sha: string; agentName: string; files: string[] }[];
  filesChanged: number;
}

export default function FinalizeBox({
  workspaceId,
  finalized,
}: {
  workspaceId: string;
  finalized: boolean;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [closeOpen, setCloseOpen] = useState(false);

  async function finalize() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/finalize`, {
        method: "POST",
        credentials: "same-origin",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Export failed.");
      const result = json.result as FinalizeResult;
      const q = new URLSearchParams({ branch: result.branch });
      if (result.prNumber != null) q.set("n", String(result.prNumber));
      if (result.prUrl) q.set("pr", result.prUrl);
      router.push(`/dashboard/${workspaceId}/exported?${q.toString()}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed.");
    } finally {
      setBusy(false);
    }
  }

  if (finalized) {
    return (
      <div className="rounded-2xl border border-line bg-card p-6">
        <h2 className="font-display text-base font-semibold">Finish session</h2>
        <p className="mt-1 text-sm text-muted">This workspace was already finalized.</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-line bg-card p-6">
      <h2 className="font-display text-base font-semibold">Finish session</h2>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          onClick={() => setConfirming(true)}
          className="btn rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-white hover:bg-neutral-800"
        >
          Finalize & export
        </button>
        <button
          onClick={() => setCloseOpen(true)}
          className="btn rounded-full bg-red-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-red-700"
        >
          Close and Delete Changes
        </button>
      </div>
      {confirming && (
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
      )}

      <CloseSessionModal
        workspaceId={workspaceId}
        open={closeOpen}
        onClose={() => setCloseOpen(false)}
        onClosed={() => router.push("/dashboard")}
      />
    </div>
  );
}
