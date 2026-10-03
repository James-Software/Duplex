"use client";

import { useState } from "react";

export interface JoinRequest {
  id: string;
  name: string;
  username_label: string | null;
  client_type: string;
}

/** Centered approval modal for an agent join request.
 *  Deliberately undismissable: the backdrop does nothing and there is no
 *  Escape shortcut — the owner must pick Accept, Deny, or the X (which
 *  declines). */
export default function JoinRequestModal({
  agent,
  workspaceName,
  busy,
  onAccept,
  onDeny,
}: {
  agent: JoinRequest;
  workspaceName: string;
  busy: "approve" | "decline" | null;
  onAccept: () => void;
  onDeny: () => void;
}) {
  const [imgOk, setImgOk] = useState(true);
  const gh = (agent.username_label ?? "").trim() || null;
  const initial = (agent.name.trim().charAt(0) || "?").toUpperCase();

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="join-request-title"
    >
      {/* Backdrop intentionally has no click handler — it does nothing. */}
      <div className="absolute inset-0 bg-black/30 motion-safe:animate-[modal-in_150ms_ease-out]" />
      <div className="relative w-full max-w-sm rounded-2xl border border-line bg-card p-6 motion-safe:animate-[modal-in_150ms_ease-out]">
        <button
          onClick={onDeny}
          disabled={busy !== null}
          aria-label="Deny and close"
          title="Deny"
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

        <div className="text-center">
          {gh && imgOk ? (
            // next/image cannot optimize the dynamic github.com avatar URL;
            // existing avatar usage in this codebase uses plain img for the same reason.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`https://github.com/${gh}.png?size=128`}
              alt=""
              onError={() => setImgOk(false)}
              className="mx-auto h-16 w-16 rounded-full border border-line"
            />
          ) : (
            <span
              aria-hidden="true"
              className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-line bg-accent-soft font-display text-2xl font-semibold text-accent-dark"
            >
              {initial}
            </span>
          )}
          <h3 id="join-request-title" className="mt-4 font-display text-lg font-semibold">
            {gh ? `@${gh}` : agent.name}
          </h3>
          {gh && <p className="mt-0.5 text-sm text-muted">{agent.name}</p>}
          <p className="mt-1 text-sm text-muted">
            wants to join <span className="font-medium text-ink">{workspaceName}</span>
          </p>
          <p className="mt-1 font-mono text-xs text-faint">{agent.client_type}</p>
        </div>

        <div className="mt-6 flex gap-3">
          <button
            onClick={onDeny}
            disabled={busy !== null}
            className="btn flex-1 rounded-full border border-line py-2.5 text-sm font-medium text-muted hover:border-ink hover:text-ink disabled:opacity-50"
          >
            {busy === "decline" ? "Denying…" : "Deny"}
          </button>
          <button
            onClick={onAccept}
            disabled={busy !== null}
            className="btn flex-1 rounded-full bg-accent py-2.5 text-sm font-semibold text-white hover:bg-accent-dark disabled:opacity-50"
          >
            {busy === "approve" ? "Accepting…" : "Accept"}
          </button>
        </div>
      </div>
    </div>
  );
}
