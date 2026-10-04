"use client";

import { useEffect, useState } from "react";
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
  workspaceName,
  repoName,
  baseBranch,
}: {
  workspaceId: string;
  finalized: boolean;
  workspaceName: string;
  repoName: string;
  baseBranch: string;
}) {
  const router = useRouter();
  const [modalOpen, setModalOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [prTitle, setPrTitle] = useState("");
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [suggesting, setSuggesting] = useState(false);

  const [closeOpen, setCloseOpen] = useState(false);

  const defaultTitle = `Duplex: ${workspaceName}`;

  function openModal() {
    setPrTitle("");
    setSuggestion(null);
    setSuggesting(true);
    setError(null);
    setModalOpen(true);
  }

  // When the modal opens, ask the server for an AI-suggested PR title. The
  // input starts empty; the suggestion becomes its placeholder. The typed
  // value always wins on confirm.
  useEffect(() => {
    if (!modalOpen) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/workspaces/${workspaceId}/suggest-pr-title`, {
          method: "POST",
          credentials: "same-origin",
        });
        if (!cancelled && res.ok) {
          const json = await res.json();
          if (typeof json.title === "string" && json.title.trim()) {
            setSuggestion(json.title.trim());
          }
        }
      } catch {
        // Suggestion is best-effort; the default title covers failures.
      } finally {
        if (!cancelled) setSuggesting(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [modalOpen, workspaceId]);

  useEffect(() => {
    if (!modalOpen || busy) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setModalOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [modalOpen, busy]);

  function closeModal() {
    if (!busy) setModalOpen(false);
  }

  async function finalize() {
    setBusy(true);
    setError(null);
    try {
      const title = prTitle.trim() || suggestion || defaultTitle;
      const res = await fetch(`/api/workspaces/${workspaceId}/finalize`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prTitle: title }),
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
        <button
          onClick={() => router.push(`/dashboard/${workspaceId}/diff`)}
          className="btn mt-4 rounded-full border border-line px-5 py-2.5 text-sm font-medium hover:border-ink"
        >
          View commit diff
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-line bg-card p-6">
      <h2 className="font-display text-base font-semibold">Finish session</h2>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          onClick={openModal}
          className="btn rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-white hover:bg-accent-dark"
        >
          Finalize & export
        </button>
        <button
          onClick={() => setCloseOpen(true)}
          className="btn rounded-full bg-red-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-red-700"
        >
          Close and Delete Changes
        </button>
        <button
          onClick={() => router.push(`/dashboard/${workspaceId}/diff`)}
          className="btn rounded-full border border-line px-5 py-2.5 text-sm font-medium hover:border-ink"
        >
          View commit diff
        </button>
      </div>

      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="finalize-title"
        >
          <div
            className="absolute inset-0 bg-black/30 motion-safe:animate-[modal-in_150ms_ease-out]"
            onClick={closeModal}
          />
          <div className="relative w-full max-w-sm rounded-2xl border border-line bg-card p-6 motion-safe:animate-[modal-in_150ms_ease-out]">
            <button
              onClick={closeModal}
              disabled={busy}
              aria-label="Close"
              title="Close"
              className="btn absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-neutral-100 hover:text-ink disabled:opacity-50"
            >
              <svg
                viewBox="0 0 12 12"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                className="h-3.5 w-3.5"
                aria-hidden="true"
              >
                <path d="M2.5 2.5l7 7M9.5 2.5l-7 7" />
              </svg>
            </button>

            <h3 id="finalize-title" className="font-display text-lg font-semibold">
              Finalize and export?
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              Freezing locks the workspace so agents can no longer make changes.
              Everything is exported to GitHub as a branch with one commit per
              agent, opened as a pull request.
            </p>
            <p className="mt-3 font-mono text-xs text-faint">
              {repoName} · {baseBranch}
            </p>

            <label className="mt-4 block">
              <span className="text-xs font-medium text-ink">Pull request title</span>
              <input
                value={prTitle}
                onChange={(e) => setPrTitle(e.target.value)}
                placeholder={suggesting ? "Suggesting title…" : (suggestion ?? defaultTitle)}
                spellCheck={false}
                maxLength={150}
                disabled={busy}
                className="mt-1.5 w-full rounded-lg border border-line bg-card px-3 py-1.5 text-sm text-ink placeholder:text-faint outline-none focus:border-accent disabled:opacity-50"
              />
            </label>

            {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

            <div className="mt-6 flex gap-3">
              <button
                onClick={closeModal}
                disabled={busy}
                className="btn flex-1 rounded-full border border-line py-2.5 text-sm font-medium text-muted hover:border-ink hover:text-ink disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={finalize}
                disabled={busy}
                className="btn flex-1 rounded-full bg-accent py-2.5 text-sm font-semibold text-white hover:bg-accent-dark disabled:opacity-50"
              >
                {busy ? "Exporting…" : "Freeze and export"}
              </button>
            </div>
          </div>
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
