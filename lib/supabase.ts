import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "./env";

/** Service-role client: server-side only. Bypasses RLS by design. */
let admin: SupabaseClient | null = null;

export function supabaseAdmin(): SupabaseClient {
  if (!admin) {
    admin = createClient(env.supabaseUrl(), env.supabaseServiceRoleKey(), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return admin;
}
