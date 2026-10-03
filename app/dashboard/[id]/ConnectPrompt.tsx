"use client";

import { useState } from "react";

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
      className="btn relative flex h-9 w-9 items-center justify-center rounded-full border border-line text-muted hover:border-ink hover:text-ink"
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

function buildPrompt(
  client: "claude" | "codex",
  appUrl: string,
  joinCode: string,
  username: string,
  workspaceName: string
): string {
  const config =
    client === "claude"
      ? `Claude Code — add to .mcp.json (or run: claude mcp add --transport http duplex ${appUrl}/api/mcp):
{
  "mcpServers": {
    "duplex": { "url": "${appUrl}/api/mcp" }
  }
}`
      : `Codex — add to ~/.codex/config.toml:
[mcp_servers.duplex]
url = "${appUrl}/api/mcp"`;
  return [
    `DUPLEX — join the "${workspaceName}" collaboration workspace:`,
    ``,
    `1. Connect to the MCP server:`,
    `   ${config}`,
    ``,
    `2. Call the join_workspace tool with:`,
    `   code: "${joinCode}"`,
    `   client_type: "${client === "claude" ? "claude-code" : "codex"}"`,
    `   username_label: "${username}"`,
    ``,
    `3. You start as PENDING. Poll get_team_status with your agent_id every`,
    `   ~10 seconds until the workspace creator approves you. Then pass the`,
    `   session_token it returns on every other tool call.`,
  ].join("\n");
}

export default function ConnectPrompt({
  appUrl,
  joinCode,
  username,
  workspaceName,
}: {
  appUrl: string;
  joinCode: string;
  username: string;
  workspaceName: string;
}) {
  const [tab, setTab] = useState<"claude" | "codex">("claude");
  const prompt = buildPrompt(tab, appUrl, joinCode, username, workspaceName);

  return (
    <div className="rounded-2xl border border-line bg-card p-6">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-base font-semibold">Connect an agent</h2>
        <MorphCopyButton text={prompt} />
      </div>
      <p className="mt-1 text-sm text-muted">
        Paste this prompt into the agent. It connects, joins, and waits for your approval.
      </p>
      <div className="mt-4 flex gap-1 rounded-full bg-wash p-1 w-fit">
        {(["claude", "codex"] as const).map((c) => (
          <button
            key={c}
            onClick={() => setTab(c)}
            className={`btn rounded-full px-4 py-1.5 text-sm font-medium ${
              tab === c ? "bg-card text-ink shadow-sm border border-line" : "text-muted hover:text-ink"
            }`}
          >
            {c === "claude" ? "Claude Code" : "Codex"}
          </button>
        ))}
      </div>
      <pre className="mt-3 max-h-72 overflow-auto rounded-xl bg-ink p-4 font-mono text-xs leading-relaxed text-neutral-200 whitespace-pre-wrap">
        {prompt}
      </pre>
    </div>
  );
}
