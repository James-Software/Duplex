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

function ClaudeMark({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="#D97757" className={className} role="img" aria-label="Claude">
      <path d="m4.7144 15.9555 4.7174-2.6471.079-.2307-.079-.1275h-.2307l-.7893-.0486-2.6956-.0729-2.3375-.0971-2.2646-.1214-.5707-.1215-.5343-.7042.0546-.3522.4797-.3218.686.0608 1.5179.1032 2.2767.1578 1.6514.0972 2.4468.255h.3886l.0546-.1579-.1336-.0971-.1032-.0972L6.973 9.8356l-2.55-1.6879-1.3356-.9714-.7225-.4918-.3643-.4614-.1578-1.0078.6557-.7225.8803.0607.2246.0607.8925.686 1.9064 1.4754 2.4893 1.8336.3643.3035.1457-.1032.0182-.0728-.164-.2733-1.3539-2.4467-1.445-2.4893-.6435-1.032-.17-.6194c-.0607-.255-.1032-.4674-.1032-.7285L6.287.1335 6.6997 0l.9957.1336.419.3642.6192 1.4147 1.0018 2.2282 1.5543 3.0296.4553.8985.2429.8318.091.255h.1579v-.1457l.1275-1.706.2368-2.0947.2307-2.6957.0789-.7589.3764-.9107.7468-.4918.5828.2793.4797.686-.0668.4433-.2853 1.8517-.5586 2.9021-.3643 1.9429h.2125l.2429-.2429.9835-1.3053 1.6514-2.0643.7286-.8196.85-.9046.5464-.4311h1.0321l.759 1.1293-.34 1.1657-1.0625 1.3478-.8804 1.1414-1.2628 1.7-.7893 1.36.0729.1093.1882-.0183 2.8535-.607 1.5421-.2794 1.8396-.3157.8318.3886.091.3946-.3278.8075-1.967.4857-2.3072.4614-3.4364.8136-.0425.0304.0486.0607 1.5482.1457.6618.0364h1.621l3.0175.2247.7892.522.4736.6376-.079.4857-1.2142.6193-1.6393-.3886-3.825-.9107-1.3113-.3279h-.1822v.1093l1.0929 1.0686 2.0035 1.8092 2.5075 2.3314.1275.5768-.3218.4554-.34-.0486-2.2039-1.6575-.85-.7468-1.9246-1.621h-.1275v.17l.4432.6496 2.3436 3.5214.1214 1.0807-.17.3521-.6071.2125-.6679-.1214-1.3721-1.9246L14.38 17.959l-1.1414-1.9428-.1397.079-.674 7.2552-.3156.3703-.7286.2793-.6071-.4614-.3218-.7468.3218-1.4753.3886-1.9246.3157-1.53.2853-1.9004.17-.6314-.0121-.0425-.1397.0182-1.4328 1.9672-2.1796 2.9446-1.7243 1.8456-.4128.164-.7164-.3704.0667-.6618.4008-.5889 2.386-3.0357 1.4389-1.882.929-1.0868-.0062-.1579h-.0546l-6.3385 4.1164-1.1293.1457-.4857-.4554.0608-.7467.2307-.2429 1.9064-1.3114Z" />
    </svg>
  );
}

function CodexMark({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="1.68 1.75 16.65 16.5" className={className} role="img" aria-label="Codex">
      <path d="M11.248 18.25q-.825 0-1.568-.314a4.3 4.3 0 0 1-1.32-.874 4 4 0 0 1-1.304.214 4 4 0 0 1-2.046-.544 4.27 4.27 0 0 1-1.518-1.485 4 4 0 0 1-.56-2.095q0-.48.131-1.04A4.4 4.4 0 0 1 2.04 10.71a4.07 4.07 0 0 1 .017-3.4 4.2 4.2 0 0 1 1.056-1.418 3.8 3.8 0 0 1 1.6-.842 3.9 3.9 0 0 1 .76-1.683q.593-.759 1.451-1.188a4.04 4.04 0 0 1 1.832-.429q.825 0 1.567.313.742.314 1.32.875a4 4 0 0 1 1.304-.215q1.106 0 2.046.545a4.14 4.14 0 0 1 1.501 1.485q.578.941.578 2.095 0 .48-.132 1.04.66.61 1.023 1.419.363.792.363 1.666 0 .892-.38 1.717a4.3 4.3 0 0 1-1.072 1.435 3.8 3.8 0 0 1-1.584.825 3.8 3.8 0 0 1-.775 1.683 4.06 4.06 0 0 1-1.436 1.188 4.04 4.04 0 0 1-1.832.429m-4.076-2.062q.825 0 1.435-.347l3.103-1.782a.36.36 0 0 0 .164-.313v-1.42L7.881 14.62a.67.67 0 0 1-.726 0l-3.118-1.798a.5.5 0 0 1-.017.115v.198q0 .841.396 1.551.413.693 1.139 1.089a3.2 3.2 0 0 0 1.617.412m.165-2.69a.4.4 0 0 0 .181.05q.083 0 .165-.05l1.238-.71-3.977-2.31a.7.7 0 0 1-.363-.643v-3.58q-.825.362-1.32 1.122a2.9 2.9 0 0 0-.495 1.65q0 .809.413 1.55.412.743 1.072 1.123zm3.91 3.663q.875 0 1.585-.396a2.96 2.96 0 0 0 1.534-2.64v-3.564a.32.32 0 0 0-.165-.297l-1.254-.726v4.604a.7.7 0 0 1-.363.643l-3.119 1.799a3 3 0 0 0 1.783.577m.627-6.039V8.878L10.01 7.822 8.129 8.878v2.244l1.881 1.056zM7.057 5.859a.7.7 0 0 1 .363-.644l3.119-1.798a3 3 0 0 0-1.782-.578q-.874 0-1.584.396A2.96 2.96 0 0 0 6.05 4.324a3.07 3.07 0 0 0-.396 1.551v3.547q0 .199.165.314l1.237.726zm8.383 7.887q.825-.364 1.303-1.123.495-.758.495-1.65a3.15 3.15 0 0 0-.412-1.55q-.413-.743-1.073-1.123l-3.086-1.782q-.099-.065-.181-.049a.3.3 0 0 0-.165.05l-1.238.692 3.993 2.327a.6.6 0 0 1 .264.264.64.64 0 0 1 .1.363zm-3.317-8.382a.63.63 0 0 1 .726 0l3.135 1.831v-.297q0-.792-.396-1.501a2.86 2.86 0 0 0-1.105-1.155q-.71-.43-1.65-.43-.825 0-1.436.347L8.294 5.941a.36.36 0 0 0-.165.314v1.418z" />
    </svg>
  );
}

function CursorMark({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 466.73 532.09" className={className} role="img" aria-label="Cursor">
      <path
        fill="#26251e"
        d="M457.43,125.94L244.42,2.96c-6.84-3.95-15.28-3.95-22.12,0L9.3,125.94c-5.75,3.32-9.3,9.46-9.3,16.11v247.99c0,6.65,3.55,12.79,9.3,16.11l213.01,122.98c6.84,3.95,15.28,3.95,22.12,0l213.01-122.98c5.75-3.32,9.3-9.46,9.3-16.11v-247.99c0-6.65-3.55-12.79-9.3-16.11h-.01ZM444.05,151.99l-205.63,356.16c-1.39,2.4-5.06,1.42-5.06-1.36v-233.21c0-4.66-2.49-8.97-6.53-11.31L24.87,145.67c-2.4-1.39-1.42-5.06,1.36-5.06h411.26c5.84,0,9.49,6.33,6.57,11.39h-.01Z"
      />
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
    body: "Finalize the session into a branch and PR, commits attributed to you, agent provenance in the trailers.",
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
          <div className="mb-6 flex items-center justify-center gap-3" aria-label="Works with Claude, Codex, and Cursor">
            <span
              title="Claude"
              className="flex h-12 w-12 items-center justify-center rounded-full border border-line bg-card transition-transform duration-150 hover:scale-105"
            >
              <ClaudeMark className="h-6 w-6" />
            </span>
            <span
              title="Codex"
              className="flex h-12 w-12 items-center justify-center rounded-full border border-line bg-card transition-transform duration-150 hover:scale-105"
            >
              <CodexMark className="h-6 w-6" />
            </span>
            <span
              title="Cursor"
              className="flex h-12 w-12 items-center justify-center rounded-full border border-line bg-card transition-transform duration-150 hover:scale-105"
            >
              <CursorMark className="h-6 w-6" />
            </span>
          </div>
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
            <GitHubMark className="inline-block h-[0.85em] w-[0.85em] rounded-full bg-white align-[-0.12em]" />{" "}
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
