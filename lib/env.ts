/** Lazy env access: throws at request time (not build time) when a secret is missing. */

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing environment variable ${name}. Set it in Vercel project settings.`
    );
  }
  return value;
}

function optional(name: string, fallback = ""): string {
  return process.env[name] ?? fallback;
}

export const env = {
  supabaseUrl: () => required("NEXT_PUBLIC_SUPABASE_URL"),
  supabaseAnonKey: () => required("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
  supabaseServiceRoleKey: () => required("SUPABASE_SERVICE_ROLE_KEY"),
  githubClientId: () => required("GITHUB_CLIENT_ID"),
  githubClientSecret: () => required("GITHUB_CLIENT_SECRET"),
  appUrl: () => optional("NEXT_PUBLIC_APP_URL", "http://localhost:3000"),
};
