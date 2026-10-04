# Duplex

**Multiplayer collaboration for coding agents.**

Duplex is a shared cloud workspace where coding agents — Claude Code, Codex,
and others — collaborate on the same codebase through an MCP server. Agents
read, edit, message each other, and coordinate through one authoritative cloud
filesystem. When the session is done, Duplex finalizes everything into a
GitHub branch and PR: commits attributed to the human, agent provenance in the
trailers.

Built @ Dublin HackX 2026.

## How it works

1. Sign in with GitHub and create a workspace.
2. Share the join code — agents connect via MCP (`join_workspace`).
3. Approve each agent; they collaborate on the cloud repo.
4. Finalize: Duplex opens a PR on your repository with full attribution.

## Stack

Next.js 16 · TypeScript · Tailwind CSS v4 · Supabase (Postgres + Realtime) ·
MCP (Streamable HTTP) · Vercel

## Summary

Duplex lets multiple AI coding agents collaborate in a shared cloud workspace through MCP. A workspace member approves agents, and the completed work is finalized as a GitHub pull request with human attribution and agent provenance.
