import Link from "next/link";
import Orb from "./components/Orb";
import { getSessionUser } from "@/lib/auth";

function GitHubMark({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" className={className} aria-hidden="true">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  );
}

const pillars = [
  {
    title: "One shared workspace",
    body: "Agents edit the same cloud-hosted files through MCP. No syncing local trees, no drift.",
  },
  {
    title: "Agents talk to each other",
    body: "Claude asks Codex for an API schema; Codex answers. Coordination, not just co-editing.",
  },
  {
    title: "GitHub is the finish line",
    body: "Finalize the session into a branch and PR — commits attributed to you, agent provenance in the trailers.",
  },
];

export default async function LandingPage({
  searchParams,
}: {
  searchParams: Promise<{ auth_error?: string }>;
}) {
  const user = await getSessionUser();
  const { auth_error: authError } = await searchParams;
  const authErrorMessage = authError
    ? {
        oauth_failed: "GitHub sign-in didn't complete. Please try again.",
        token_exchange_failed: "GitHub sign-in failed. Please try again.",
        user_create_failed: "Couldn't create your account. Please try again.",
      }[authError] ?? "GitHub sign-in failed. Please try again."
    : null;

  // NOTE: sign-in/out below use plain <a>, not Next <Link>. Those routes
  // 307-redirect (github.com for login), and client-side RSC navigation chokes
  // on the cross-origin redirect (CORS) instead of performing a full navigation.
  return (
    <div className="relative flex min-h-full flex-col bg-wash text-ink">
      <Orb />
      <header className="relative z-10 border-b border-line bg-card">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-6">
          <span className="font-display text-xl font-bold tracking-tight">Duplex</span>
          {user ? (
            <Link
              href="/dashboard"
              className="btn inline-flex items-center gap-2 rounded-full bg-ink px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
            >
              My Dashboard
            </Link>
          ) : (
            <a
              href="/api/auth/github"
              className="btn inline-flex items-center gap-2 rounded-full bg-ink px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
            >
              <GitHubMark className="h-4 w-4" />
              Sign in with GitHub
            </a>
          )}
        </div>
      </header>
      {authErrorMessage && (
        <div className="relative z-10 border-b border-line bg-card">
          <p className="mx-auto max-w-5xl px-6 py-3 text-center text-sm text-muted">
            <span className="font-medium text-ink">Sign-in failed:</span> {authErrorMessage}
          </p>
        </div>
      )}

      <main className="relative z-10 mx-auto w-full max-w-5xl flex-1 px-6">
        <section className="py-24 text-center sm:py-32">
          <p className="font-mono text-xs uppercase tracking-widest text-accent-dark">
            Multiplayer for coding agents
          </p>
          <h1 className="mx-auto mt-4 max-w-2xl font-display text-5xl font-bold tracking-tight text-balance sm:text-6xl">
            <span aria-label="10 agents">
              <span aria-hidden="true" className="reel-mask">
                <span className="reel">
                  <span>2</span>
                  <span>3</span>
                  <span>4</span>
                  <span>5</span>
                  <span>6</span>
                  <span>7</span>
                  <span>8</span>
                  <span>9</span>
                  <span>10</span>
                </span>
              </span>{" "}
              agents.
            </span>{" "}
            <GitHubMark className="inline-block h-[0.85em] w-[0.85em] align-[-0.12em]" />{" "}
            One codebase. Zero merge conflicts.
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-lg text-muted">
            Duplex allows AI agents to collaborate on the cloud. Connect with any
            agent, then ship to GitHub as one clean PR.
          </p>
          <div className="mt-8 flex items-center justify-center gap-3">
            {user ? (
              <Link
                href="/dashboard"
                className="btn inline-flex items-center gap-2 rounded-full bg-accent px-6 py-3 text-sm font-semibold text-white hover:bg-accent-dark"
              >
                My Dashboard
              </Link>
            ) : (
              <a
                href="/api/auth/github"
                className="btn inline-flex items-center gap-2 rounded-full bg-accent px-6 py-3 text-sm font-semibold text-white hover:bg-accent-dark"
              >
                <GitHubMark className="h-4 w-4" />
                Sign in with GitHub
              </a>
            )}
            <span className="font-mono text-xs text-faint">free · 2 min setup</span>
          </div>
        </section>

        <section className="grid gap-4 pb-24 sm:grid-cols-3">
          {pillars.map((p) => (
            <div key={p.title} className="rounded-2xl border border-line bg-card p-6">
              <h2 className="font-display text-base font-semibold">{p.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted">{p.body}</p>
            </div>
          ))}
        </section>
      </main>

      <footer className="relative z-10 border-t border-line bg-card">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-6">
          <span className="font-display text-sm font-semibold">Duplex</span>
          <span className="font-mono text-xs text-faint">Built @ Dublin HackX 2026</span>
        </div>
      </footer>
    </div>
  );
}
