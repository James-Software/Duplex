# Duplex — Demo Script (Dublin HackX)

Target: ~5 minutes. Every step below is live — no mockups.

## Before the judges arrive

- [ ] App deployed on Vercel, env vars set (`NEXT_PUBLIC_SUPABASE_URL`,
      `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
      `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `NEXT_PUBLIC_APP_URL`)
- [ ] Supabase migration `supabase/migrations/0001_duplex.sql` applied
- [ ] Signed in with GitHub on the dashboard (do this once, stay signed in)
- [ ] Two terminals ready: Terminal 1 = Claude Code, Terminal 2 = Codex —
      both with the Duplex MCP server configured (see the dashboard's
      "Connect an agent" prompt for the exact config)
- [ ] A target GitHub repo in mind (can be empty — agents build from scratch)
- [ ] Dashboard open on the projector; join code visible

## The script

### 1. The hook (30s)

> "Claude Code and Codex each write great code alone. But what happens when
> they need to work *together*? Today, they can't — every agent lives in its
> own world, overwriting each other's work. **Duplex is multiplayer for
> coding agents**: one shared cloud workspace, and GitHub is the finish line."

### 2. Create the workspace (30s)

- Dashboard → **New workspace**: name it, point it at the repo, hit Create.
- Point at the big mono **join code** on screen.
- "This code is all an agent needs. Watch."

### 3. Two agents join (1 min)

- **Terminal 1 (Claude Code):** paste the connect prompt from the dashboard.
  Agent calls `join_workspace` → dashboard shows **"Claude #1 wants to join"**.
  Click **Accept**.
- **Terminal 2 (Codex):** same prompt. **"Codex #1 wants to join"** → Accept.
- "Both agents are now in the same cloud filesystem. No local clones, no sync."

### 4. They collaborate (1.5 min) — the heart of the demo

- Tell Claude: *"Build the landing page in index.html."*
  Tell Codex: *"Build the signup API in api/signup.ts."*
- Narrate the **activity feed** as it lights up: claims, file creates, edits.
- **The money moment:** prompt Claude: *"Ask Codex what its signup API returns,
  then use that shape in your landing page form."*
  - Claude → `send_message` → Codex: "what does POST /api/signup return?"
  - Codex replies: "{ user, token }"
  - Claude edits its own file to match. Show the message exchange in the feed.
- "They're not just editing the same files — they're *coordinating* like a team."

### 5. The conflict (30s) — the edge-case scorer

- Have both agents edit the same line of the same file (or do it yourself via
  a second `edit_file` with a stale version).
- Show the **CONFLICT** response: who changed it, which version is current.
- "No silent overwrites. The agent reads the latest version and rebases —
  optimistic concurrency, the same idea as Git, built for agents."

### 6. Export to GitHub (1 min)

- Dashboard → **Finalize & export** → confirm.
- Show the result card: branch `collab/<id>`, commit count, file count.
- Open the **pull request** on GitHub:
  - Commits authored by **you** (the human) —
  - …with `Agent: Codex #1` / `Agent-ID:` trailers preserving provenance.
- "The cloud workspace becomes a normal PR. Review it like any other."

### 7. Close (30s)

> "Agents write more of the world's code every month. They've needed a
> collaboration layer — shared state, messaging, conflict awareness, and a
> clean handoff to GitHub. That's Duplex."

## If something goes wrong

- **Agent stuck on "pending":** you forgot to click Accept — the dashboard
  shows pending requests at the top of Team.
- **Join code expired:** codes live 30 minutes — hit Regenerate, re-paste.
- **MCP not connecting:** verify the server URL in `.mcp.json` /
  `~/.codex/config.toml` is `https://<your-app>/api/mcp` (https, no trailing slash).
- **Demo gods:** the activity feed polls every 2.5s — if it looks frozen,
  it's the network, not the product. Keep talking; it catches up.
