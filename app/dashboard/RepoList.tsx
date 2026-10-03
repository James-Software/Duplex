"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { GitHubRepo } from "@/lib/github";

interface RepoListProps {
  repos: GitHubRepo[];
  /** repo full_name -> active workspace id */
  sessions: Record<string, string>;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function RepoList({ repos, sessions }: RepoListProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [busyRepo, setBusyRepo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return repos;
    return repos.filter(
      (r) =>
        r.full_name.toLowerCase().includes(q) ||
        (r.description ?? "").toLowerCase().includes(q)
    );
  }, [repos, query]);

  async function createSession(fullName: string) {
    setBusyRepo(fullName);
    setError(null);
    try {
      const res = await fetch("/api/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ github_repo: fullName }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not create session.");
      router.push(`/dashboard/${json.workspace.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create session.");
    } finally {
      setBusyRepo(null);
    }
  }

  return (
    <div>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search repositories…"
        spellCheck={false}
        className="w-full rounded-xl border border-line bg-card px-4 py-2.5 text-sm text-ink placeholder:text-faint outline-none focus:border-accent"
      />

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {filtered.map((repo) => {
          const sessionId = sessions[repo.full_name];
          const busy = busyRepo === repo.full_name;
          const meta = [
            repo.language,
            repo.stargazers_count > 0 ? `★ ${repo.stargazers_count}` : null,
            `updated ${formatDate(repo.updated_at)}`,
          ]
            .filter(Boolean)
            .join(" · ");
          return (
            <div
              key={repo.full_name}
              className="flex flex-col rounded-2xl border border-line bg-card p-5"
            >
              <div className="flex items-start justify-between gap-3">
                <h2 className="break-all font-mono text-sm font-semibold text-ink">
                  {repo.full_name}
                </h2>
                {repo.private && (
                  <span className="shrink-0 rounded-full bg-neutral-100 px-2 py-0.5 font-mono text-[11px] text-muted">
                    private
                  </span>
                )}
              </div>
              {repo.description && (
                <p className="mt-1.5 line-clamp-2 text-sm text-muted">
                  {repo.description}
                </p>
              )}
              <p className="mt-3 font-mono text-xs text-faint">{meta}</p>
              <div className="mt-auto pt-4">
                {sessionId ? (
                  <Link
                    href={`/dashboard/${sessionId}`}
                    className="btn inline-flex rounded-full border border-line px-4 py-2 text-sm font-medium text-ink hover:border-accent hover:text-accent-dark"
                  >
                    Open Session →
                  </Link>
                ) : (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => createSession(repo.full_name)}
                    className="btn rounded-full bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-dark disabled:opacity-50"
                  >
                    {busy ? "Creating…" : "Create Session"}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <p className="mt-6 rounded-2xl border border-dashed border-line p-8 text-center text-sm text-faint">
          {repos.length === 0
            ? "No repositories found on your GitHub account."
            : "No repositories match your search."}
        </p>
      )}
    </div>
  );
}
