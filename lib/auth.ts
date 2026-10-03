import { cookies } from "next/headers";
import { COOKIE_NAME, verifySessionCookie } from "./session";
import { supabaseAdmin } from "./supabase";
import type { DbUser } from "./db";

/** Returns the signed-in user, or null. Safe to call from pages and routes. */
export async function getSessionUser(): Promise<DbUser | null> {
  const jar = await cookies();
  const userId = verifySessionCookie(jar.get(COOKIE_NAME)?.value);
  if (!userId) return null;
  const { data, error } = await supabaseAdmin()
    .from("users")
    .select("*")
    .eq("id", userId)
    .single();
  if (error || !data) return null;
  return data as DbUser;
}
