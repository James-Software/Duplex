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

const AGENT_NAME_COOKIE = "duplex_agent_name";
const DEFAULT_AGENT_NAME = "Unnamed Coding Agent";

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
    `DUPLEX — join the "${workspaceName}" collaboration workspace:`,
    ``,
    `What Duplex is: a shared cloud workspace where multiple AI coding agents`,
    `collaborate on the same files in real time through an MCP server —`,
    `multiplayer for coding agents. A human creator approves each agent that`,
    `joins; when the work is done, the workspace exports to GitHub as one pull request.`,
    ``,
    `1. Connect to the MCP server:`,
    `   ${appUrl}/api/mcp`,
    `   (Claude Code: \`claude mcp add --transport http duplex ${appUrl}/api/mcp\` or add to .mcp.json;`,
    `    Codex: add \`[mcp_servers.duplex]\` with \`url = "${appUrl}/api/mcp"\` to ~/.codex/config.toml)`,
    ``,
    `2. Call the join_workspace tool with:`,
    `   code: "${joinCode}"`,
    `   agent_name: "${agentName}"`,
    `   client_type: "claude-code" | "codex" | "other" (whichever you are)`,
    `   username_label: "${username}"`,
    ``,
    `3. You start as PENDING. Poll get_team_status with your agent_id every`,
    `   ~10 seconds until the workspace creator approves you. Then pass the`,
    `   session_token it returns on every other tool call.`,
    ``,
    `4. When your work is FULLY done, you MUST call the complete tool with a`,
    `   short paragraph (max 500 characters) summarizing what you changed.`,
    `   Never go silent without calling complete.`,
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
  const [agentName, setAgentName] = useState(readAgentNameCookie);
  const effectiveName = agentName.trim() ? agentName.trim() : DEFAULT_AGENT_NAME;
  const prompt = buildPrompt(appUrl, joinCode, username, workspaceName, effectiveName);

  function onNameChange(value: string) {
    setAgentName(value);
    writeAgentNameCookie(value);
  }

  return (
    <div className="rounded-2xl border border-line bg-card p-6">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-base font-semibold">Connect an agent</h2>
        <MorphCopyButton text={prompt} />
      </div>
      <p className="mt-1 text-sm text-muted">
        Paste this prompt into the agent. It connects, joins, and waits for your approval.
      </p>
      <label className="mt-4 block">
        <span className="text-sm font-medium text-ink">Agent name</span>
        <input
          value={agentName}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder={DEFAULT_AGENT_NAME}
          spellCheck={false}
          maxLength={80}
          className="mt-1.5 w-full rounded-xl border border-line bg-card px-4 py-2.5 text-sm text-ink placeholder:text-faint outline-none focus:border-accent"
        />
      </label>
      <pre className="mt-3 max-h-72 overflow-auto rounded-xl bg-ink p-4 font-mono text-xs leading-relaxed text-neutral-200 whitespace-pre-wrap">
        {prompt}
      </pre>
    </div>
  );
}
