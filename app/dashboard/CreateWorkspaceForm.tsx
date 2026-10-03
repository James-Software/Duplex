"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function CreateWorkspaceForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [repo, setRepo] = useState("");
  const [branch, setBranch] = useState("main");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          github_repo: repo,
          github_base_branch: branch || "main",
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not create workspace.");
      setName("");
      setRepo("");
      setBranch("main");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create workspace.");
    } finally {
      setBusy(false);
    }
  }

  const input =
    "w-full rounded-xl border border-line bg-card px-3 py-2 text-sm text-ink placeholder:text-faint outline-none focus:border-accent";

  return (
    <form onSubmit={onSubmit} className="rounded-2xl border border-line bg-card p-6">
      <h2 className="font-display text-base font-semibold">New workspace</h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted">Name</span>
          <input
            className={input}
            placeholder="My Hackathon App"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted">GitHub repo</span>
          <input
            className={input}
            placeholder="owner/repo"
            value={repo}
            onChange={(e) => setRepo(e.target.value)}
            required
            spellCheck={false}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted">Base branch</span>
          <input
            className={input}
            placeholder="main"
            value={branch}
            onChange={(e) => setBranch(e.target.value)}
            spellCheck={false}
          />
        </label>
      </div>
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={busy}
        className="btn mt-4 rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-white hover:bg-accent-dark disabled:opacity-50"
      >
        {busy ? "Creating…" : "Create workspace"}
      </button>
    </form>
  );
}
