"use client";

import { useEffect, useState, type CSSProperties } from "react";
import JoinCodeBox from "./JoinCodeBox";

function CopyIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className={className} aria-hidden="true">
      <rect x="5.5" y="5.5" width="8" height="8" rx="2" />
      <path d="M10.5 5.5v-2a2 2 0 0 0-2-2h-5a2 2 0 0 0-2 2v5a2 2 0 0 0 2 2h2" />
    </svg>
  );
}

function CheckIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M3 8.5l3.5 3.5L13 4.5" />
    </svg>
  );
}

function ChevronIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M4 6l4 4 4-4" />
    </svg>
  );
}

function RefreshIcon({ className = "", style }: { className?: string; style?: CSSProperties }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} style={style} aria-hidden="true">
      <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
      <path d="M3 21v-5h5" />
    </svg>
  );
}

/** Copy button that morphs copy → checkmark (blur + 0.97 press, per motion principles). */
function MorphCopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  return (
    <button
      onClick={copy}
      aria-label={copied ? "Copied" : "Copy prompt"}
      className="btn relative flex h-8 w-8 items-center justify-center rounded-full border border-line text-muted hover:border-ink hover:text-ink"
    >
      <span
        className={`absolute transition-all duration-150 ${
          copied ? "scale-90 opacity-0 blur-[2px]" : "scale-100 opacity-100 blur-0"
        }`}
      >
        <CopyIcon className="h-4 w-4" />
      </span>
      <span
        className={`absolute text-accent transition-all duration-150 ${
          copied ? "scale-100 opacity-100 blur-0" : "scale-90 opacity-0 blur-[2px]"
        }`}
      >
        <CheckIcon className="h-4 w-4" />
      </span>
    </button>
  );
}

const AGENT_NAME_COOKIE = "duplex_agent_name";
const DEFAULT_AGENT_NAME = "Unnamed Coding Agent";

const RANDOM_AGENT_NAMES = [
  "Pixel", "Bolt", "Echo", "Nova", "Cipher", "Byte", "Turbo", "Quartz",
  "Vortex", "Ember", "Flux", "Onyx", "Zephyr", "Cobalt", "Drift", "Flint",
  "Glitch", "Halo", "Ion", "Jolt", "Koda", "Lumen", "Mist", "Nimbus",
  "Orbit", "Prism", "Quark", "Raven", "Sol", "Tango", "Umbra", "Vector",
  "Wisp", "Xenon", "Yonder", "Zinc", "Ash", "Blaze", "Cinder", "Dune",
  "Edge", "Fern", "Grove", "Harbor", "Iris", "Jade", "Kiln", "Lark",
  "Maple", "North",
];

function readAgentNameCookie(): string {
  if (typeof document === "undefined") return DEFAULT_AGENT_NAME;
  const match = document.cookie
    .split("; ")
    .find((c) => c.startsWith(AGENT_NAME_COOKIE + "="));
  if (!match) return DEFAULT_AGENT_NAME;
  try {
    const value = decodeURIComponent(match.slice(AGENT_NAME_COOKIE.length + 1));
    return value.trim() ? value : DEFAULT_AGENT_NAME;
  } catch {
    return DEFAULT_AGENT_NAME;
  }
}

function writeAgentNameCookie(value: string) {
  document.cookie = `${AGENT_NAME_COOKIE}=${encodeURIComponent(
    value
  )}; max-age=31536000; path=/; SameSite=Lax`;
}

function buildPrompt(
  appUrl: string,
  joinCode: string,
  username: string,
  workspaceName: string,
  agentName: string
): string {
  return [
    `DUPLEX: join the "${workspaceName}" collaboration workspace:`,
    ``,
    `What Duplex is: a shared cloud workspace where multiple AI coding agents`,
    `collaborate on the same files in real time through an MCP server,`,
    `multiplayer for coding agents. A workspace member approves each agent that`,
    `joins; when the work is done, the workspace exports to GitHub as one pull request.`,
    ``,
    `1. Connect to the MCP server:`,
    `   ${appUrl}/api/mcp`,
    `   (Claude Code: \`claude mcp add --transport http duplex ${appUrl}/api/mcp\` or add to .mcp.json;`,
    `    Codex: add \`[mcp_servers.duplex]\` with \`url = "${appUrl}/api/mcp"\` to ~/.codex/config.toml;`,
    `    OpenCode: under "mcp" in opencode.json add "duplex": {"type": "remote", "url": "${appUrl}/api/mcp", "enabled": true};`,
    `    anything else: connect to the URL above using your client's default remote-MCP setup)`,
    ``,
    `2. Call the join_workspace tool with:`,
    `   code: "${joinCode}"`,
    `   agent_name: "${agentName}"`,
    `   client_type: "claude-code" | "codex" | "other" (whichever you are)`,
    `   username_label: "${username}"`,
    ``,
    `3. You start as PENDING. Poll get_team_status with your agent_id every`,
    `   2.5 seconds until the workspace creator approves you. Then pass the`,
    `   session_token it returns on every other tool call. Keep polling`,
    `   get_team_status periodically while you work; messages from your`,
    `   teammates are delivered there, even if you never call get_messages.`,
    ``,
    `4. When your work is FULLY done, you MUST call the complete tool with a`,
    `   short paragraph (max 500 characters) summarizing what you changed.`,
    `   Never go silent without calling complete.`,
    ``,
    `5. If you ever reconnect or resume (new session, compacted context,`,
    `   dropped off): FIRST call get_team_status with your agent_id to catch`,
    `   up on the team and your unread messages, and get_diff to see what`,
    `   files changed, before touching anything.`,
  ].join("\n");
}

export default function ConnectPrompt({
  appUrl,
  joinCode,
  username,
  workspaceName,
  workspaceId,
  expires,
  autoRegenerate,
  onRegenerated,
}: {
  appUrl: string;
  joinCode: string;
  username: string;
  workspaceName: string;
  workspaceId: string;
  expires: string;
  autoRegenerate: boolean;
  onRegenerated: (newCode: string, newExpires: string) => void;
}) {
  const [agentName, setAgentName] = useState(readAgentNameCookie);
  const [showPrompt, setShowPrompt] = useState(false);
  const [spins, setSpins] = useState(0);
  // Team names are loaded once in the background so rolling a name is instant.
  const [takenNames, setTakenNames] = useState<Set<string>>(new Set());

  async function fetchTeamNames(): Promise<Set<string>> {
    const names = new Set<string>();
    const res = await fetch(`/api/workspaces/${workspaceId}/team`, {
      credentials: "same-origin",
    });
    if (!res.ok) return names;
    const json = await res.json();
    for (const a of (json.agents ?? []) as { name?: string }[]) {
      const n = (a.name ?? "").trim().toLowerCase();
      if (n) names.add(n);
    }
    return names;
  }

  useEffect(() => {
    let cancelled = false;
    fetchTeamNames()
      .then((names) => {
        if (!cancelled) setTakenNames(names);
      })
      .catch(() => {
        /* keep the empty set — the roll still works */
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);
  const effectiveName = agentName.trim() ? agentName.trim() : DEFAULT_AGENT_NAME;
  const prompt = buildPrompt(appUrl, joinCode, username, workspaceName, effectiveName);

  function onNameChange(value: string) {
    setAgentName(value);
    writeAgentNameCookie(value);
  }

  function randomizeName() {
    setSpins((s) => s + 1);
    // Instant: roll against the background-loaded names, then refresh
    // the cache for the next roll without blocking this one.
    const taken = new Set(takenNames);
    const current = agentName.trim().toLowerCase();
    if (current) taken.add(current);
    const options = RANDOM_AGENT_NAMES.filter(
      (n) => !taken.has(n.toLowerCase())
    );
    const pool = options.length > 0 ? options : RANDOM_AGENT_NAMES;
    onNameChange(pool[Math.floor(Math.random() * pool.length)]);
    fetchTeamNames()
      .then(setTakenNames)
      .catch(() => {
        /* stale cache is fine — the next roll still avoids known names */
      });
  }

  return (
    <div className="rounded-2xl border border-line bg-card p-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-sm font-semibold">Connect an agent</h2>
        <MorphCopyButton text={prompt} />
      </div>
      <JoinCodeBox
        workspaceId={workspaceId}
        code={joinCode}
        expires={expires}
        autoRegenerate={autoRegenerate}
        onRegenerated={onRegenerated}
      />
      <div className="mt-3 flex items-center gap-2">
        <label
          htmlFor="duplex-agent-name"
          className="shrink-0 text-xs font-medium text-ink"
        >
          Agent name
        </label>
        <button
          onClick={randomizeName}
          title="Random name"
          aria-label="Generate a random agent name"
          className="btn flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-line text-muted hover:border-ink hover:text-ink"
        >
          <RefreshIcon
            className="h-3.5 w-3.5 transition-transform duration-300"
            style={{ transform: `rotate(${spins * 180}deg)` }}
          />
        </button>
        <input
          id="duplex-agent-name"
          value={agentName}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder="e.g. Codex"
          spellCheck={false}
          maxLength={80}
          className="w-full rounded-lg border border-line bg-card px-3 py-1.5 text-sm text-ink placeholder:text-faint outline-none focus:border-accent"
        />
      </div>
      <button
        onClick={() => setShowPrompt((v) => !v)}
        aria-expanded={showPrompt}
        className="btn mt-3 flex items-center gap-1 text-xs font-medium text-muted hover:text-ink"
      >
        <ChevronIcon
          className={`h-3.5 w-3.5 transition-transform duration-150 ${
            showPrompt ? "rotate-180" : ""
          }`}
        />
        {showPrompt ? "Hide full prompt" : "View full prompt"}
      </button>
      {showPrompt && (
        <pre className="mt-2 max-h-64 overflow-auto rounded-xl bg-ink p-4 font-mono text-xs leading-relaxed text-neutral-200 whitespace-pre-wrap">
          {prompt}
        </pre>
      )}
    </div>
  );
}
