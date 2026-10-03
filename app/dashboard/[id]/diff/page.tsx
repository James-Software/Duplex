"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

type LineType = "add" | "del" | "context";
interface DiffLine {
  type: LineType;
  text: string;
}
interface FileDiff {
  path: string;
  status: "added" | "modified" | "deleted";
  additions: number;
  deletions: number;
  hunks: { lines: DiffLine[] }[];
  tooLarge?: true;
  binary?: true;
  truncated?: true;
}

function XIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" />
    </svg>
  );
}

function StatusBadge({ status }: { status: FileDiff["status"] }) {
  if (status === "added")
    return (
      <span className="rounded-full bg-accent-soft px-2 py-0.5 font-mono text-[11px] font-medium text-accent-dark">
        Added
      </span>
    );
  if (status === "deleted")
    return (
      <span className="rounded-full bg-red-50 px-2 py-0.5 font-mono text-[11px] font-medium text-red-600">
        Deleted
      </span>
    );
  return (
    <span className="rounded-full bg-wash px-2 py-0.5 font-mono text-[11px] font-medium text-muted">
      Modified
    </span>
  );
}

function DiffLines({ hunks }: { hunks: { lines: DiffLine[] }[] }) {
  return (
    <>
      {hunks.map((hunk, hi) => (
        <div key={hi} className={hi > 0 ? "border-t border-line" : ""}>
          {hunk.lines.map((line, li) => {
            const sign = line.type === "add" ? "+" : line.type === "del" ? "−" : " ";
            return (
              <div
                key={li}
                className={`flex ${
                  line.type === "add"
                    ? "bg-accent-soft"
                    : line.type === "del"
                      ? "bg-red-50"
                      : ""
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`w-8 shrink-0 select-none pr-2 text-right ${
                    line.type === "add"
                      ? "text-accent-dark"
                      : line.type === "del"
                        ? "text-red-600"
                        : "text-faint"
                  }`}
                >
                  {sign}
                </span>
                <span className="whitespace-pre pr-4">
                  {line.text === "" ? " " : line.text}
                </span>
              </div>
            );
          })}
        </div>
      ))}
    </>
  );
}

export default function DiffPage() {
  const params = useParams();
  const id = params.id as string;
  const [files, setFiles] = useState<FileDiff[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const backHref = `/dashboard/${id}`;

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/workspaces/${id}/diff`, {
          credentials: "same-origin",
        });
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok) throw new Error(json.error ?? "Failed to load diff.");
        setFiles(json as FileDiff[]);
      } catch (e) {
        if (!cancelled)
          setError(e instanceof Error ? e.message : "Failed to load diff.");
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  return (
    <div className="min-h-screen bg-wash text-ink">
      <header className="border-b border-line bg-card">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-6">
          <div className="flex items-center gap-4">
            <Link
              href={backHref}
              aria-label="Back to session"
              className="btn font-mono text-sm text-muted hover:text-ink"
            >
              ←
            </Link>
            <h1 className="font-display text-xl font-bold tracking-tight">
              Commit diff
            </h1>
            {files !== null && (
              <span className="font-mono text-xs text-faint">
                {files.length} file{files.length === 1 ? "" : "s"}
              </span>
            )}
          </div>
          <Link
            href={backHref}
            aria-label="Close diff"
            className="btn flex h-9 w-9 items-center justify-center rounded-full border border-line text-muted hover:border-ink hover:text-ink"
          >
            <XIcon className="h-4 w-4" />
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl px-6 py-8">
        {error && <p className="text-sm text-red-600">{error}</p>}
        {files === null && !error && (
          <p className="text-sm text-muted">Loading diff…</p>
        )}
        {files !== null && files.length === 0 && (
          <p className="rounded-2xl border border-dashed border-line p-8 text-center text-sm text-faint">
            No changes yet. Agents haven&apos;t edited anything.
          </p>
        )}
        {files !== null &&
          files.map((f) => (
            <section
              key={f.path}
              className="mb-5 overflow-hidden rounded-2xl border border-line bg-card"
            >
              <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="truncate font-mono text-sm font-medium">
                    {f.path}
                  </span>
                  <StatusBadge status={f.status} />
                </div>
                <span className="shrink-0 font-mono text-xs">
                  <span className="text-accent-dark">+{f.additions}</span>{" "}
                  <span className="text-red-600">−{f.deletions}</span>
                </span>
              </div>
              <div className="overflow-x-auto py-1 font-mono text-xs leading-5">
                {f.tooLarge ? (
                  <p className="px-4 py-3 text-muted">
                    File too large to diff.
                  </p>
                ) : f.binary ? (
                  <p className="px-4 py-3 text-muted">Binary file.</p>
                ) : (
                  <DiffLines hunks={f.hunks} />
                )}
                {f.truncated && (
                  <p className="border-t border-line px-4 py-2 text-faint">
                    Diff truncated: showing the first 300 lines.
                  </p>
                )}
              </div>
            </section>
          ))}
      </main>
    </div>
  );
}
