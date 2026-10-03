import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getWorkspaceForUser } from "@/lib/workspaces";
import { supabaseAdmin } from "@/lib/supabase";

interface FeedItem {
  id: string;
  ts: string;
  kind: "join" | "edit" | "message" | "claim";
  actor: string;
  text: string;
}

/**
 * GET /api/workspaces/[id]/feed — merged activity feed (owner only).
 * Combines agent joins, file edits, messages, and claims, newest first.
 * Polled by the dashboard every ~2.5s (reads go through the service_role
 * server-side; RLS stays locked down).
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  if (!(await getWorkspaceForUser(id, user.id))) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const db = supabaseAdmin();

  const [{ data: agents }, { data: edits }, { data: messages }, { data: claims }] =
    await Promise.all([
      db.from("agents").select("id, name, created_at").eq("workspace_id", id),
      db
        .from("edits")
        .select("id, path, before_version, after_version, timestamp, agent_id")
        .eq("workspace_id", id)
        .order("timestamp", { ascending: false })
        .limit(30),
      db
        .from("messages")
        .select("id, message, created_at, sender_agent_id, recipient_agent_id")
        .eq("workspace_id", id)
        .order("created_at", { ascending: false })
        .limit(30),
      db
        .from("claims")
        .select("id, path, intent, created_at, agent_id")
        .eq("workspace_id", id)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

  const names = Object.fromEntries(
    ((agents ?? []) as { id: string; name: string }[]).map((a) => [a.id, a.name])
  );
  const items: FeedItem[] = [];

  for (const a of (agents ?? []) as { id: string; name: string; created_at: string }[]) {
    items.push({ id: `join-${a.id}`, ts: a.created_at, kind: "join", actor: a.name, text: `${a.name} joined the workspace` });
  }
  for (const e of (edits ?? []) as {
    id: string; path: string; before_version: number; after_version: number;
    timestamp: string; agent_id: string | null;
  }[]) {
    const who = e.agent_id ? names[e.agent_id] ?? "?" : "?";
    const what = e.after_version === 0 ? "deleted" : e.before_version === 0 ? "created" : "edited";
    items.push({
      id: `edit-${e.id}`, ts: e.timestamp, kind: "edit", actor: who,
      text: `${who} ${what} ${e.path}` + (e.after_version > 0 ? ` (v${e.before_version} → v${e.after_version})` : ""),
    });
  }
  for (const m of (messages ?? []) as {
    id: string; message: string; created_at: string;
    sender_agent_id: string | null; recipient_agent_id: string | null;
  }[]) {
    const from = m.sender_agent_id ? names[m.sender_agent_id] ?? "?" : "?";
    const to = m.recipient_agent_id ? ` → ${names[m.recipient_agent_id] ?? "?"}` : "";
    items.push({ id: `msg-${m.id}`, ts: m.created_at, kind: "message", actor: from, text: `${from}${to}: ${m.message}` });
  }
  for (const c of (claims ?? []) as {
    id: string; path: string; intent: string | null; created_at: string; agent_id: string;
  }[]) {
    const who = names[c.agent_id] ?? "?";
    items.push({
      id: `claim-${c.id}`, ts: c.created_at, kind: "claim", actor: who,
      text: `${who} claimed ${c.path}` + (c.intent ? ` — “${c.intent}”` : ""),
    });
  }

  items.sort((a, b) => (a.ts < b.ts ? 1 : -1));
  return NextResponse.json({ feed: items.slice(0, 40) });
}
