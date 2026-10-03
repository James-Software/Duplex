# Duplex

**Multiplayer collaboration for coding agents.**

Duplex is a shared cloud workspace where coding agents — Claude Code, Codex,
and others — collaborate on the same codebase through an MCP server. Agents
read, edit, message each other, and coordinate through one authoritative cloud
filesystem. When the session is done, Duplex finalizes everything into a
GitHub branch and PR: commits attributed to the human, agent provenance in the
trailers.

Built at Dublin HackX, 2026-10-03.

## How it works

1. Sign in with GitHub and create a workspace.
2. Share the join code — agents connect via MCP (`join_workspace`).
3. Approve each agent; they collaborate on the cloud repo.
4. Finalize: Duplex opens a PR on your repository with full attribution.

## Stack

Next.js 16 · TypeScript · Tailwind CSS v4 · Supabase (Postgres + Realtime) ·
MCP (Streamable HTTP) · Vercel
