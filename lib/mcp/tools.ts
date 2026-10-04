import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { supabaseAdmin } from "../supabase";
import type { DbAgent, DbFile } from "../db";
import { agentFromToken, cleanPath, errorResult, isRecentlyActive, textResult } from "./util";
import { rotateMemberJoinCode } from "../access";

const sessionTokenField = z
  .string()
  .describe("Your session token (returned by get_team_status after approval).");

const pathField = z.string().describe("Workspace-relative file path, e.g. src/app.ts.");

function normalizeCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

const CLIENT_PREFIX: Record<string, string> = {
  "claude-code": "Claude",
  codex: "Codex",
  other: "Agent",
};

async function agentName(id: string | null): Promise<string> {
  if (!id) return "unknown";
  const { data } = await supabaseAdmin().from("agents").select("name").eq("id", id).single();
  return (data as { name: string } | null)?.name ?? "unknown";
}

async function recordEdit(
  workspaceId: string,
  agent: DbAgent,
  path: string,
  beforeVersion: number,
  afterVersion: number
) {
  await supabaseAdmin().from("edits").insert({
    workspace_id: workspaceId,
    agent_id: agent.id,
    user_id: agent.user_id,
    path,
    before_version: beforeVersion,
    after_version: afterVersion,
  });
}

async function touchAgentPath(agentId: string, path: string) {
  await supabaseAdmin()
    .from("agents")
    .update({ current_path: path, last_seen: new Date().toISOString() })
    .eq("id", agentId);
}

/**
 * Fetch messages the agent hasn't seen yet, for inline delivery in
 * get_team_status (message-in-poll) — agents that only poll still learn
 * about messages sent while they were idle. Marks them read up to the newest
 * delivered message (never now(), so a message landing mid-query isn't
 * skipped). Best-effort: any failure returns "" and never breaks the poll.
 */
async function deliverUnreadMessages(
  db: ReturnType<typeof supabaseAdmin>,
  agent: DbAgent
): Promise<string> {
  try {
    const lastRead = (agent as { last_read_at?: string | null }).last_read_at ?? null;
    const since = lastRead ?? new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { data: msgRows, error } = await db
      .from("messages")
      .select("sender_agent_id, recipient_agent_id, message, created_at")
      .eq("workspace_id", agent.workspace_id)
      .or(`recipient_agent_id.is.null,recipient_agent_id.eq.${agent.id}`)
      .gt("created_at", since)
      .order("created_at", { ascending: true })
      .limit(10);
    if (error || !msgRows) return "";
    const unread = (msgRows as {
      sender_agent_id: string | null;
      recipient_agent_id: string | null;
      message: string;
      created_at: string;
    }[]).filter((m) => m.sender_agent_id !== agent.id);
    if (unread.length === 0) return "";
    const { data: teamRows } = await db
      .from("agents")
      .select("id, name")
      .eq("workspace_id", agent.workspace_id);
    const names = Object.fromEntries(
      ((teamRows ?? []) as { id: string; name: string }[]).map((t) => [t.id, t.name])
    );
    const lines = unread.map((m) => {
      const from = m.sender_agent_id ? names[m.sender_agent_id] ?? "?" : "system";
      const to = m.recipient_agent_id ? ` → ${names[m.recipient_agent_id] ?? "?"}` : " → everyone";
      return `[${from}${to}]: ${m.message}`;
    });
    try {
      const { error: markError } = await db
        .from("agents")
        .update({ last_read_at: unread[unread.length - 1].created_at })
        .eq("id", agent.id);
      if (markError) console.error("mark messages read failed:", markError.message);
    } catch (e) {
      console.error("mark messages read failed:", e);
    }
    return (
      `\n\nUNREAD MESSAGES (${unread.length}) — delivered here; also readable via get_messages:\n` +
      lines.join("\n")
    );
  } catch (e) {
    console.error("unread message delivery failed:", e);
    return "";
  }
}

/**
 * Check whether a rival agent holds an unexpired claim (lock) on a path.
 * Returns the holder's name/intent when blocked, null when the caller may proceed.
 */
async function checkFileLock(
  workspaceId: string,
  agentId: string,
  path: string
): Promise<{ name: string; intent: string | null } | null> {
  const { data } = await supabaseAdmin()
    .from("claims")
    .select("intent, agents!inner(name)")
    .eq("workspace_id", workspaceId)
    .eq("path", path)
    .gt("expires_at", new Date().toISOString())
    .neq("agent_id", agentId)
    .single();
  if (!data) return null;
  const row = data as unknown as { intent: string | null; agents: { name: string } };
  return { name: row.agents.name, intent: row.intent };
}

function lockError(path: string, holder: { name: string; intent: string | null }): string {
  return (
    `LOCKED: ${holder.name} holds ${path}` +
    (holder.intent ? ` ("${holder.intent}")` : "") +
    `. Message them with send_message to coordinate, or wait for the claim to expire.`
  );
}

/**
 * Build the CONFLICT message after a conditional write matched zero rows
 * (the atomic-increment race was lost). Re-reads the file for the current
 * version and last editor so the wording matches the fast-path error.
 */
async function conflictMessage(
  db: ReturnType<typeof supabaseAdmin>,
  workspaceId: string,
  path: string,
  baseVersion: number,
  verb: "write" | "edit"
): Promise<string> {
  const { data } = await db
    .from("workspace_files")
    .select("version, updated_by_agent")
    .eq("workspace_id", workspaceId)
    .eq("path", path)
    .single();
  const row = data as { version: number; updated_by_agent: string | null } | null;
  if (!row) {
    return `CONFLICT on ${path}: you based your ${verb} on version ${baseVersion}, but the file no longer exists.`;
  }
  const who = await agentName(row.updated_by_agent);
  return (
    `CONFLICT on ${path}: you based your ${verb} on version ${baseVersion}, but the file is now version ${row.version} ` +
    `(last edited by ${who}). Call read_file to get the latest content, then re-apply your change.`
  );
}

/** Write an agent's status message (agents.current_task). Shared by set_status and complete. */
async function writeAgentStatus(
  agentId: string,
  status: string,
  maxChars = 140
): Promise<{ error?: string; value: string | null }> {
  const value = status.trim().slice(0, maxChars) || null;
  const { error } = await supabaseAdmin().from("agents").update({ current_task: value }).eq("id", agentId);
  if (error) return { error: error.message, value: null };
  return { value };
}

/** Register every Duplex MCP tool on the given server. */
export function registerDuplexTools(server: McpServer) {
  // ---------------- join ----------------
  server.registerTool(
    "join_workspace",
    {
      description:
        "Request to join a Duplex collaboration workspace using a member's join code. You start as PENDING — poll get_team_status until a workspace member approves you.",
      inputSchema: {
        code: z.string().describe("The workspace join code, e.g. M7K4-P9Q2-X3B8-D5F6."),
        client_type: z
          .enum(["claude-code", "codex", "other"])
          .describe("Which coding agent you are."),
        username_label: z
          .string()
          .optional()
          .describe("The human's username (from the invite prompt) so the creator recognizes you."),
        agent_name: z
          .string()
          .optional()
          .describe("Custom display name. Defaults to e.g. 'Claude #1'."),
      },
    },
    async ({ code, client_type, username_label, agent_name }) => {
      const db = supabaseAdmin();
      const needle = normalizeCode(code);
      // Join codes are per-member: every workspace member (owner included)
      // has their own code, and the agent inherits that member as approver.
      const { data: memberRows } = await db
        .from("workspace_members")
        .select("id, workspace_id, join_code, join_code_expires_at, workspace:workspaces!inner(id, name, created_by, status)");
      const match = ((memberRows ?? []) as unknown as {
        id: string;
        workspace_id: string;
        join_code: string;
        join_code_expires_at: string;
        workspace: { id: string; name: string; created_by: string; status: string };
      }[]).find(
        (m) => normalizeCode(m.join_code) === needle && m.workspace?.status === "active"
      );
      if (!match) {
        return errorResult(
          "Join code not recognized. Check the code with the workspace member who shared it."
        );
      }
      const ws = match.workspace;
      if (new Date(match.join_code_expires_at).getTime() < Date.now()) {
        return errorResult(
          "That join code has expired. Ask the workspace member to regenerate it on the dashboard."
        );
      }
      const { count } = await db
        .from("agents")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", ws.id)
        .eq("client_type", client_type);
      const n = (count ?? 0) + 1;
      const name =
        agent_name?.trim() || `${CLIENT_PREFIX[client_type] ?? "Agent"} #${n}`;
      const { data: agent, error } = await db
        .from("agents")
        .insert({
          workspace_id: ws.id,
          user_id: ws.created_by,
          member_id: match.id,
          name,
          client_type,
          username_label: username_label?.trim() || null,
          status: "pending",
        })
        .select("id")
        .single();
      if (error || !agent) {
        return errorResult(`Could not register: ${error?.message ?? "unknown error"}`);
      }

      // Single-use join codes: rotate the member's code now that this agent
      // has connected. The agent already holds its agent_id, so rotation
      // doesn't affect it. Never fail the join over rotation.
      try {
        await rotateMemberJoinCode(match.id);
      } catch (e) {
        console.error("join_workspace: join code rotation failed", e);
      }

      return textResult(
        `Join request sent to workspace "${ws.name}" as "${name}" (agent_id: ${(agent as { id: string }).id}).\n` +
          `STATUS: PENDING — the team member who shared this join code must approve you in the dashboard.\n` +
          `Poll get_team_status with your agent_id every ~10 seconds until approved.\n` +
          `When your work is fully done, call complete with a summary of your changes (required).\n` +
          `If you're rejoining after a break, call get_team_status with your agent_id immediately after approval to catch up.`
      );
    }
  );

  // ---------------- team status (approval poll) ----------------
  server.registerTool(
    "get_team_status",
    {
      description:
        "Check whether you have been approved, and see the team. Before approval this is your poll endpoint; after approval it returns your session_token.",
      inputSchema: {
        agent_id: z.string().describe("Your agent_id from join_workspace."),
      },
    },
    async ({ agent_id }) => {
      const db = supabaseAdmin();
      const { data: agentRow } = await db.from("agents").select("*").eq("id", agent_id).single();
      const agent = agentRow as DbAgent | null;
      if (!agent) return errorResult("Unknown agent_id. Call join_workspace first.");
      const { data: wsRow } = await db
        .from("workspaces")
        .select("id, name, github_repo, github_base_branch")
        .eq("id", agent.workspace_id)
        .single();
      const { data: teamRows } = await db
        .from("agents")
        .select("id, name, client_type, status, current_task, username_label")
        .eq("workspace_id", agent.workspace_id)
        .order("created_at", { ascending: true });
      // "Editing" is driven by real edit history, not agent activity: the
      // edits table records every mutation, so an agent shows as editing the
      // path of its most recent edit — but only within the activity window.
      const { data: editRows } = await db
        .from("edits")
        .select("agent_id, path, created_at")
        .eq("workspace_id", agent.workspace_id)
        .order("created_at", { ascending: false })
        .limit(1000);
      const latestEditByAgent = new Map<string, { path: string; created_at: string }>();
      for (const e of (editRows ?? []) as { agent_id: string; path: string; created_at: string }[]) {
        if (!latestEditByAgent.has(e.agent_id)) latestEditByAgent.set(e.agent_id, e);
      }
      const team = ((teamRows ?? []) as Partial<DbAgent>[])
        .map((t) => {
          const lastEdit = t.id ? latestEditByAgent.get(t.id) : undefined;
          const editing =
            lastEdit && isRecentlyActive(lastEdit.created_at) ? ` · editing ${lastEdit.path}` : "";
          return (
            `• ${t.name} (${t.client_type}${t.username_label ? `, ${t.username_label}` : ""}) — ${t.status}` +
            editing +
            (t.current_task ? ` · ${t.current_task}` : "")
          );
        })
        .join("\n");
      const ws = wsRow as { id: string; name: string; github_repo: string; github_base_branch: string };

      if (agent.status === "pending") {
        const unread = await deliverUnreadMessages(db, agent);
        return textResult(
          `APPROVED: false\nWorkspace: "${ws.name}" (${ws.github_repo})\n\n` +
            `You are still waiting for approval. Ask the team member who shared the join code to accept "${agent.name}" in the dashboard, then poll again in ~10 seconds.` +
            unread
        );
      }
      if (agent.status !== "active" || !agent.session_token) {
        return errorResult(`Your agent status is "${agent.status}". You cannot collaborate.`);
      }
      const unread = await deliverUnreadMessages(db, agent);
      return textResult(
        `APPROVED: true\nYour session_token: ${agent.session_token}\n` +
          `Pass it as "session_token" on every other tool call.\n\n` +
          `Workspace: "${ws.name}" — ${ws.github_repo} (branch ${ws.github_base_branch})\n` +
          `This is a SHARED cloud filesystem: read_file/edit_file/write_file operate on the same files every agent sees.\n\n` +
          `TEAM:\n${team || "(just you)"}\n\n` +
          `WORKFLOW: list_files to orient → read_file (note its version) → claim_files before big edits (exclusive lock) → ` +
          `edit_file with the base_version you read → send_message to coordinate. ` +
          `If edit_file reports a CONFLICT, read_file again and rebase your change. ` +
          `If a file is LOCKED by a teammate, message them with send_message instead of editing it. ` +
          `Keep polling get_team_status while you work — unread messages from teammates are delivered there. ` +
          `When your work is FULLY done, you MUST call complete with a short paragraph summarizing what you changed — ` +
          `never go silent without calling it.` +
          unread
      );
    }
  );

  // ---------------- read_file ----------------
  server.registerTool(
    "read_file",
    {
      description: "Read a file from the shared workspace. Returns its content and version.",
      inputSchema: { session_token: sessionTokenField, path: pathField },
    },
    async ({ session_token, path }) => {
      const { agent, error: authError } = await agentFromToken(session_token);
      if (!agent) return errorResult(authError ?? "Invalid session token.");
      const p = cleanPath(path);
      if (!p) return errorResult("Invalid path.");
      const { data } = await supabaseAdmin()
        .from("workspace_files")
        .select("*")
        .eq("workspace_id", agent.workspace_id)
        .eq("path", p)
        .single();
      const file = data as DbFile | null;
      if (!file) return errorResult(`File not found: ${p}. Use list_files to see what exists.`);
      // Reads must not set current_path — requireAgent already refreshed
      // last_seen, so the agent still counts as active without looking like
      // it's editing the file.
      return textResult(`--- ${p} (version ${file.version}) ---\n${file.content}`);
    }
  );

  // ---------------- write_file ----------------
  server.registerTool(
    "write_file",
    {
      description:
        "Write (create or fully overwrite) a file. Provide base_version when overwriting to enable conflict detection.",
      inputSchema: {
        session_token: sessionTokenField,
        path: pathField,
        content: z.string().describe("The complete new file content."),
        base_version: z
          .number()
          .int()
          .optional()
          .describe("Version you last read. If the file changed since, you get a CONFLICT instead of overwriting."),
      },
    },
    async ({ session_token, path, content, base_version }) => {
      const { agent, error: authError } = await agentFromToken(session_token);
      if (!agent) return errorResult(authError ?? "Invalid session token.");
      const p = cleanPath(path);
      if (!p) return errorResult("Invalid path.");
      const db = supabaseAdmin();
      const lock = await checkFileLock(agent.workspace_id, agent.id, p);
      if (lock) return errorResult(lockError(p, lock));
      const { data: existing } = await db
        .from("workspace_files")
        .select("*")
        .eq("workspace_id", agent.workspace_id)
        .eq("path", p)
        .single();
      const row = existing as DbFile | null;
      if (row) {
        if (base_version !== undefined && base_version !== row.version) {
          const who = await agentName(row.updated_by_agent);
          return errorResult(
            `CONFLICT on ${p}: you based your write on version ${base_version}, but the file is now version ${row.version} (last edited by ${who}). Call read_file to get the latest content, then re-apply your change.`
          );
        }
        // Atomic increment: the version predicate makes the check-and-write a
        // single statement, so a same-instant race can't silently overwrite.
        const now = new Date().toISOString();
        if (base_version !== undefined) {
          const { data: won, error } = await db
            .from("workspace_files")
            .update({
              content,
              version: base_version + 1,
              updated_by_agent: agent.id,
              updated_at: now,
            })
            .eq("workspace_id", agent.workspace_id)
            .eq("path", p)
            .eq("version", base_version)
            .select("version");
          if (error) return errorResult(`Write failed: ${error.message}`);
          if (!won || (won as { version: number }[]).length === 0) {
            return errorResult(await conflictMessage(db, agent.workspace_id, p, base_version, "write"));
          }
          await recordEdit(agent.workspace_id, agent, p, base_version, base_version + 1);
          await touchAgentPath(agent.id, p);
          return textResult(`Wrote ${p} (version ${base_version} → ${base_version + 1}).`);
        }
        const { error } = await db
          .from("workspace_files")
          .update({
            content,
            version: row.version + 1,
            updated_by_agent: agent.id,
            updated_at: now,
          })
          .eq("workspace_id", agent.workspace_id)
          .eq("path", p);
        if (error) return errorResult(`Write failed: ${error.message}`);
        await recordEdit(agent.workspace_id, agent, p, row.version, row.version + 1);
        await touchAgentPath(agent.id, p);
        return textResult(`Wrote ${p} (version ${row.version} → ${row.version + 1}).`);
      }
      const { error } = await db.from("workspace_files").insert({
        workspace_id: agent.workspace_id,
        path: p,
        content,
        version: 1,
        updated_by_agent: agent.id,
      });
      if (error) return errorResult(`Write failed: ${error.message}`);
      await recordEdit(agent.workspace_id, agent, p, 0, 1);
      await touchAgentPath(agent.id, p);
      return textResult(`Created ${p} (version 1).`);
    }
  );

  // ---------------- edit_file ----------------
  server.registerTool(
    "edit_file",
    {
      description:
        "Surgically replace old_text with new_text in a file. Requires the version you read: if someone else edited first, you get a CONFLICT instead of clobbering their work.",
      inputSchema: {
        session_token: sessionTokenField,
        path: pathField,
        old_text: z.string().describe("Exact text to find (first occurrence is replaced)."),
        new_text: z.string().describe("Replacement text."),
        base_version: z.number().int().describe("The version returned by your read_file call."),
      },
    },
    async ({ session_token, path, old_text, new_text, base_version }) => {
      const { agent, error: authError } = await agentFromToken(session_token);
      if (!agent) return errorResult(authError ?? "Invalid session token.");
      const p = cleanPath(path);
      if (!p) return errorResult("Invalid path.");
      const db = supabaseAdmin();
      const lock = await checkFileLock(agent.workspace_id, agent.id, p);
      if (lock) return errorResult(lockError(p, lock));
      const { data: existing } = await db
        .from("workspace_files")
        .select("*")
        .eq("workspace_id", agent.workspace_id)
        .eq("path", p)
        .single();
      const row = existing as DbFile | null;
      if (!row) return errorResult(`File not found: ${p}.`);
      if (row.version !== base_version) {
        const who = await agentName(row.updated_by_agent);
        return errorResult(
          `CONFLICT on ${p}: you based your edit on version ${base_version}, but the file is now version ${row.version} (last edited by ${who}). Call read_file to get the latest content, then re-apply your change.`
        );
      }
      const occurrences = row.content.split(old_text).length - 1;
      if (occurrences === 0) {
        return errorResult(`old_text not found in ${p} (version ${row.version}). Read the file again to see its current content.`);
      }
      const updated = row.content.replace(old_text, new_text);
      // Atomic increment: the version predicate makes the check-and-write a
      // single statement, so a same-instant race can't silently overwrite.
      const { data: won, error } = await db
        .from("workspace_files")
        .update({
          content: updated,
          version: base_version + 1,
          updated_by_agent: agent.id,
          updated_at: new Date().toISOString(),
        })
        .eq("workspace_id", agent.workspace_id)
        .eq("path", p)
        .eq("version", base_version)
        .select("version");
      if (error) return errorResult(`Edit failed: ${error.message}`);
      if (!won || (won as { version: number }[]).length === 0) {
        return errorResult(await conflictMessage(db, agent.workspace_id, p, base_version, "edit"));
      }
      await recordEdit(agent.workspace_id, agent, p, base_version, base_version + 1);
      await touchAgentPath(agent.id, p);
      const note = occurrences > 1 ? ` (first of ${occurrences} occurrences replaced)` : "";
      return textResult(`Edited ${p} (version ${row.version} → ${row.version + 1})${note}.`);
    }
  );

  // ---------------- create_file ----------------
  server.registerTool(
    "create_file",
    {
      description: "Create a new file. Fails if the file already exists (use write_file to overwrite).",
      inputSchema: {
        session_token: sessionTokenField,
        path: pathField,
        content: z.string().describe("Initial file content."),
      },
    },
    async ({ session_token, path, content }) => {
      const { agent, error: authError } = await agentFromToken(session_token);
      if (!agent) return errorResult(authError ?? "Invalid session token.");
      const p = cleanPath(path);
      if (!p) return errorResult("Invalid path.");
      const db = supabaseAdmin();
      const lock = await checkFileLock(agent.workspace_id, agent.id, p);
      if (lock) return errorResult(lockError(p, lock));
      const { data: existing } = await db
        .from("workspace_files")
        .select("path")
        .eq("workspace_id", agent.workspace_id)
        .eq("path", p)
        .single();
      if (existing) return errorResult(`${p} already exists. Use write_file to overwrite it.`);
      const { error } = await db.from("workspace_files").insert({
        workspace_id: agent.workspace_id,
        path: p,
        content,
        version: 1,
        updated_by_agent: agent.id,
      });
      if (error) return errorResult(`Create failed: ${error.message}`);
      await recordEdit(agent.workspace_id, agent, p, 0, 1);
      await touchAgentPath(agent.id, p);
      return textResult(`Created ${p} (version 1).`);
    }
  );

  // ---------------- delete_file ----------------
  server.registerTool(
    "delete_file",
    {
      description: "Delete a file from the shared workspace.",
      inputSchema: { session_token: sessionTokenField, path: pathField },
    },
    async ({ session_token, path }) => {
      const { agent, error: authError } = await agentFromToken(session_token);
      if (!agent) return errorResult(authError ?? "Invalid session token.");
      const p = cleanPath(path);
      if (!p) return errorResult("Invalid path.");
      const db = supabaseAdmin();
      const lock = await checkFileLock(agent.workspace_id, agent.id, p);
      if (lock) return errorResult(lockError(p, lock));
      const { data: existing } = await db
        .from("workspace_files")
        .select("version")
        .eq("workspace_id", agent.workspace_id)
        .eq("path", p)
        .single();
      const row = existing as { version: number } | null;
      if (!row) return errorResult(`File not found: ${p}.`);
      const { error } = await db
        .from("workspace_files")
        .delete()
        .eq("workspace_id", agent.workspace_id)
        .eq("path", p);
      if (error) return errorResult(`Delete failed: ${error.message}`);
      await recordEdit(agent.workspace_id, agent, p, row.version, 0);
      return textResult(`Deleted ${p}.`);
    }
  );

  // ---------------- list_files ----------------
  server.registerTool(
    "list_files",
    {
      description: "List files in the shared workspace, with versions.",
      inputSchema: {
        session_token: sessionTokenField,
        prefix: z.string().optional().describe("Only list paths starting with this prefix."),
      },
    },
    async ({ session_token, prefix }) => {
      const { agent, error: authError } = await agentFromToken(session_token);
      if (!agent) return errorResult(authError ?? "Invalid session token.");
      let q = supabaseAdmin()
        .from("workspace_files")
        .select("path, version")
        .eq("workspace_id", agent.workspace_id)
        .order("path", { ascending: true })
        .limit(500);
      if (prefix) q = q.like("path", `${prefix}%`);
      const { data, error } = await q;
      if (error) return errorResult(`List failed: ${error.message}`);
      const rows = (data ?? []) as { path: string; version: number }[];
      if (rows.length === 0) return textResult("The workspace is empty. Create the first files!");
      return textResult(rows.map((r) => `${r.path} (v${r.version})`).join("\n"));
    }
  );

  // ---------------- search_files ----------------
  server.registerTool(
    "search_files",
    {
      description: "Search file paths and contents (case-insensitive substring).",
      inputSchema: {
        session_token: sessionTokenField,
        query: z.string().describe("Text to search for."),
      },
    },
    async ({ session_token, query }) => {
      const { agent, error: authError } = await agentFromToken(session_token);
      if (!agent) return errorResult(authError ?? "Invalid session token.");
      const q = `%${query.replace(/[%_]/g, "")}%`;
      const { data, error } = await supabaseAdmin()
        .from("workspace_files")
        .select("path, content")
        .eq("workspace_id", agent.workspace_id)
        .or(`path.ilike.${q},content.ilike.${q}`)
        .limit(20);
      if (error) return errorResult(`Search failed: ${error.message}`);
      const rows = (data ?? []) as { path: string; content: string }[];
      if (rows.length === 0) return textResult(`No matches for "${query}".`);
      const lower = query.toLowerCase();
      const out = rows.map((r) => {
        const idx = r.content.toLowerCase().indexOf(lower);
        const snippet =
          idx === -1
            ? "(match in path)"
            : "…" + r.content.slice(Math.max(0, idx - 60), idx + 100).replace(/\n/g, " ") + "…";
        return `${r.path}: ${snippet}`;
      });
      return textResult(out.join("\n"));
    }
  );

  // ---------------- send_message ----------------
  server.registerTool(
    "send_message",
    {
      description:
        "Send a message to another agent (by name or id), or omit recipient to broadcast to the whole team.",
      inputSchema: {
        session_token: sessionTokenField,
        message: z.string().describe("The message text."),
        recipient: z
          .string()
          .optional()
          .describe('Agent name (e.g. "Codex #1") or id. Omit to broadcast.'),
      },
    },
    async ({ session_token, message, recipient }) => {
      const { agent, error: authError } = await agentFromToken(session_token);
      if (!agent) return errorResult(authError ?? "Invalid session token.");
      const db = supabaseAdmin();
      let recipientId: string | null = null;
      let recipientName = "everyone";
      if (recipient) {
        const { data: team } = await db
          .from("agents")
          .select("id, name")
          .eq("workspace_id", agent.workspace_id)
          .neq("id", agent.id);
        const match = ((team ?? []) as { id: string; name: string }[]).find(
          (t) => t.id === recipient || t.name.toLowerCase() === recipient.toLowerCase()
        );
        if (!match) {
          const names = ((team ?? []) as { name: string }[]).map((t) => t.name).join(", ");
          return errorResult(`No teammate "${recipient}". Team: ${names || "(just you)"}`);
        }
        recipientId = match.id;
        recipientName = match.name;
      }
      const { error } = await db.from("messages").insert({
        workspace_id: agent.workspace_id,
        sender_agent_id: agent.id,
        recipient_agent_id: recipientId,
        message,
      });
      if (error) return errorResult(`Send failed: ${error.message}`);
      return textResult(`Message sent to ${recipientName}.`);
    }
  );

  // ---------------- get_messages ----------------
  server.registerTool(
    "get_messages",
    {
      description: "Read messages sent to you or broadcast to the team, oldest first.",
      inputSchema: {
        session_token: sessionTokenField,
        since: z
          .string()
          .optional()
          .describe("ISO timestamp — only messages after this. Omit for recent history."),
      },
    },
    async ({ session_token, since }) => {
      const { agent, error: authError } = await agentFromToken(session_token);
      if (!agent) return errorResult(authError ?? "Invalid session token.");
      const db = supabaseAdmin();
      let q = db
        .from("messages")
        .select("*")
        .eq("workspace_id", agent.workspace_id)
        .or(`recipient_agent_id.is.null,recipient_agent_id.eq.${agent.id},sender_agent_id.eq.${agent.id}`)
        .order("created_at", { ascending: true })
        .limit(50);
      if (since) q = q.gt("created_at", since);
      const { data, error } = await q;
      if (error) return errorResult(`Fetch failed: ${error.message}`);
      const rows = (data ?? []) as {
        sender_agent_id: string | null;
        recipient_agent_id: string | null;
        message: string;
        created_at: string;
      }[];
      if (rows.length === 0) return textResult("No messages yet.");
      const { data: team } = await db
        .from("agents")
        .select("id, name")
        .eq("workspace_id", agent.workspace_id);
      const names = Object.fromEntries(
        ((team ?? []) as { id: string; name: string }[]).map((t) => [t.id, t.name])
      );
      const lines = rows.map((m) => {
        const from = m.sender_agent_id ? names[m.sender_agent_id] ?? "?" : "?";
        const to = m.recipient_agent_id ? ` → ${names[m.recipient_agent_id] ?? "?"}` : " → everyone";
        return `[${m.created_at}] ${from}${to}: ${m.message}`;
      });
      try {
        const { error: markError } = await db
          .from("agents")
          .update({ last_read_at: rows[rows.length - 1].created_at })
          .eq("id", agent.id);
        if (markError) console.error("mark messages read failed:", markError.message);
      } catch (e) {
        console.error("mark messages read failed:", e);
      }
      return textResult(lines.join("\n"));
    }
  );

  // ---------------- claim_files ----------------
  server.registerTool(
    "claim_files",
    {
      description:
        "Take an exclusive lock on a file while you work on it. Fails if a teammate holds an unexpired lock — message them with send_message to coordinate. Locks auto-expire (default 300s); release with release_files when done.",
      inputSchema: {
        session_token: sessionTokenField,
        path: pathField,
        intent: z.string().optional().describe("What you plan to do, e.g. 'adding JWT refresh'."),
        ttl_seconds: z.number().int().min(60).max(3600).optional().describe("Claim lifetime (default 300)."),
      },
    },
    async ({ session_token, path, intent, ttl_seconds }) => {
      const { agent, error: authError } = await agentFromToken(session_token);
      if (!agent) return errorResult(authError ?? "Invalid session token.");
      const p = cleanPath(path);
      if (!p) return errorResult("Invalid path.");
      const db = supabaseAdmin();
      const { data: existing } = await db
        .from("claims")
        .select("*, agents!inner(name)")
        .eq("workspace_id", agent.workspace_id)
        .eq("path", p)
        .gt("expires_at", new Date().toISOString())
        .neq("agent_id", agent.id)
        .single();
      if (existing) {
        const holder = existing as unknown as { intent: string | null; agents: { name: string } };
        return errorResult(
          `LOCKED: ${holder.agents.name} holds ${p}` +
            (holder.intent ? ` ("${holder.intent}")` : "") +
            `. Message them with send_message to coordinate, or wait for the claim to expire.`
        );
      }
      const ttl = ttl_seconds ?? 300;
      const { error } = await db.from("claims").upsert(
        {
          workspace_id: agent.workspace_id,
          agent_id: agent.id,
          path: p,
          intent: intent ?? null,
          expires_at: new Date(Date.now() + ttl * 1000).toISOString(),
        },
        { onConflict: "workspace_id,path" }
      );
      if (error) return errorResult(`Claim failed: ${error.message}`);
      return textResult(`Locked ${p} for ${ttl}s${intent ? ` — "${intent}"` : ""}.`);
    }
  );

  // ---------------- release_files ----------------
  server.registerTool(
    "release_files",
    {
      description: "Release your claim on a file.",
      inputSchema: { session_token: sessionTokenField, path: pathField },
    },
    async ({ session_token, path }) => {
      const { agent, error: authError } = await agentFromToken(session_token);
      if (!agent) return errorResult(authError ?? "Invalid session token.");
      const p = cleanPath(path);
      if (!p) return errorResult("Invalid path.");
      const { error, count } = await supabaseAdmin()
        .from("claims")
        .delete({ count: "exact" })
        .eq("workspace_id", agent.workspace_id)
        .eq("path", p)
        .eq("agent_id", agent.id);
      if (error) return errorResult(`Release failed: ${error.message}`);
      return textResult(count ? `Released ${p}.` : `You hold no claim on ${p}.`);
    }
  );

  // ---------------- set_status ----------------
  server.registerTool(
    "set_status",
    {
      description:
        "Set your status message so the team (and the human watching the dashboard) can see what you're working on. Pass an empty string to clear it.",
      inputSchema: {
        session_token: sessionTokenField,
        status: z
          .string()
          .describe("Short status, e.g. 'Adding JWT refresh to auth.ts'. Max ~140 chars; empty clears it."),
      },
    },
    async ({ session_token, status }) => {
      const { agent, error: authError } = await agentFromToken(session_token);
      if (!agent) return errorResult(authError ?? "Invalid session token.");
      const { error, value } = await writeAgentStatus(agent.id, status);
      if (error) return errorResult(`Could not set status: ${error}`);
      return textResult(value ? `Status set: "${value}".` : "Status cleared.");
    }
  );

  // ---------------- complete ----------------
  server.registerTool(
    "complete",
    {
      description:
        "REQUIRED when your work is fully done — never go silent without calling it. Releases ALL of your file locks at once. You MUST include a summary: a short paragraph (max 500 chars) describing what you changed.",
      inputSchema: {
        session_token: sessionTokenField,
        summary: z
          .string()
          .optional()
          .describe(
            "REQUIRED. Short paragraph (max 500 chars) describing what you changed, e.g. 'Added JWT refresh to auth.ts and wired it into the login flow. All tests pass.' Shown as your status and included in the export PR."
          ),
      },
    },
    async ({ session_token, summary }) => {
      const { agent, error: authError } = await agentFromToken(session_token);
      if (!agent) return errorResult(authError ?? "Invalid session token.");
      const { count, error } = await supabaseAdmin()
        .from("claims")
        .delete({ count: "exact" })
        .eq("agent_id", agent.id);
      if (error) return errorResult(`Could not release claims: ${error.message}`);
      let statusLine = "";
      if (summary && summary.trim()) {
        const { error: statusError, value } = await writeAgentStatus(agent.id, summary, 500);
        if (statusError) return errorResult(`Released claims, but could not set summary: ${statusError}`);
        statusLine = ` Status: "${value}".`;
      }
      return textResult(`Marked complete. Released ${count ?? 0} claimed file(s).${statusLine}`);
    }
  );

  // ---------------- get_diff ----------------
  server.registerTool(
    "get_diff",
    {
      description: "See what has changed in the workspace: every file with its version and last editor.",
      inputSchema: { session_token: sessionTokenField },
    },
    async ({ session_token }) => {
      const { agent, error: authError } = await agentFromToken(session_token);
      if (!agent) return errorResult(authError ?? "Invalid session token.");
      const db = supabaseAdmin();
      const { data, error } = await db
        .from("workspace_files")
        .select("path, version, updated_by_agent, updated_at")
        .eq("workspace_id", agent.workspace_id)
        .order("path", { ascending: true });
      if (error) return errorResult(`Diff failed: ${error.message}`);
      const rows = (data ?? []) as {
        path: string;
        version: number;
        updated_by_agent: string | null;
        updated_at: string;
      }[];
      if (rows.length === 0) return textResult("Workspace is empty — nothing changed yet.");
      const { data: team } = await db
        .from("agents")
        .select("id, name")
        .eq("workspace_id", agent.workspace_id);
      const names = Object.fromEntries(
        ((team ?? []) as { id: string; name: string }[]).map((t) => [t.id, t.name])
      );
      const lines = rows.map(
        (r) => `${r.path} — v${r.version}, last by ${r.updated_by_agent ? names[r.updated_by_agent] ?? "?" : "?"}`
      );
      return textResult(`${rows.length} file(s) in workspace:\n${lines.join("\n")}`);
    }
  );
}
