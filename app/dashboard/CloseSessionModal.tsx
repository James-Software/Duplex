"use client";

import { useEffect, useState } from "react";

/**
 * Destructive confirm dialog for closing a session without exporting.
 * Permanently deletes the workspace and all its cloud data via
 * POST /api/workspaces/[id]/close. Used by both the session view
 * (FinalizeBox) and the dashboard repo list.
 */
export default function CloseSessionModal({
  workspaceId,
  open,
  onClose,
  onClosed,
}: {
  workspaceId: string;
  open: boolean;
  onClose: () => void;
  onClosed: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Escape closes the dialog.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setError(null);
        onClose();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Clear any stale error each time the dialog closes, so a reopen starts clean.
  function handleClose() {
    setError(null);
    onClose();
  }

  async function closeWorkspace() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/close`, {
        method: "POST",
        credentials: "same-origin",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not close workspace.");
      onClosed();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not close workspace.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="close-dialog-title"
    >
      <div
        className="absolute inset-0 bg-black/40 motion-safe:animate-[modal-in_150ms_ease-out]"
        onClick={() => {
          if (!busy) handleClose();
        }}
      />
      <div className="relative w-full max-w-md rounded-2xl bg-card p-6 shadow-xl motion-safe:animate-[modal-in_150ms_ease-out]">
        <h3
          id="close-dialog-title"
          className="font-display text-lg font-semibold"
        >
          Close and delete changes?
        </h3>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Every file, message, and agent contribution in this session will be
          permanently deleted. Nothing will be exported to GitHub, and this
          cannot be undone.
        </p>
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={handleClose}
            disabled={busy}
            className="btn rounded-full border border-line px-4 py-2 text-sm font-medium hover:border-ink disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={closeWorkspace}
            disabled={busy}
            className="btn rounded-full bg-red-600 px-5 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
          >
            {busy ? "Deleting…" : "Yes, delete everything"}
          </button>
        </div>
      </div>
    </div>
  );
}
