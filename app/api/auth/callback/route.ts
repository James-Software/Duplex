import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { env } from "@/lib/env";
import { createSessionValue, COOKIE_NAME, MAX_AGE_SECONDS } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabase";
import { githubApi } from "@/lib/github";

interface GitHubUser {
  id: number;
  login: string;
}

interface GitHubEmail {
  email: string;
  primary: boolean;
  verified: boolean;
}

/**
 * GET /api/auth/callback — GitHub redirects here after the user authorizes.
 * Exchanges the code for a token, upserts the user, sets the session cookie.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const jar = await cookies();
  const expectedState = jar.get("duplex_oauth_state")?.value;

  const fail = (reason: string) =>
    NextResponse.redirect(`${env.appUrl()}/?auth_error=${encodeURIComponent(reason)}`);

  if (!code || !state || !expectedState || state !== expectedState) {
    return fail("oauth_failed");
  }

  // Exchange the code for an access token.
  const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: env.githubClientId(),
      client_secret: env.githubClientSecret(),
      code,
      redirect_uri: `${env.appUrl()}/api/auth/callback`,
    }),
  });
  if (!tokenRes.ok) return fail("token_exchange_failed");
  const tokenJson = (await tokenRes.json()) as {
    access_token?: string;
    error?: string;
  };
  const accessToken = tokenJson.access_token;
  if (!accessToken) return fail(tokenJson.error ?? "token_exchange_failed");

  // Identify the user.
  const ghUser = (await githubApi(accessToken, "/user")) as GitHubUser;
  const emails = (await githubApi(accessToken, "/user/emails")) as GitHubEmail[];
  const primary = emails.find((e) => e.primary && e.verified) ?? emails[0] ?? null;

  // Upsert.
  const db = supabaseAdmin();
  const { data: existing } = await db
    .from("users")
    .select("id")
    .eq("github_id", ghUser.id)
    .single();

  let userId: string;
  if (existing) {
    userId = (existing as { id: string }).id;
    await db
      .from("users")
      .update({
        github_username: ghUser.login,
        github_email: primary?.email ?? null,
        github_token: accessToken,
      })
      .eq("id", userId);
  } else {
    const { data: created, error } = await db
      .from("users")
      .insert({
        github_id: ghUser.id,
        github_username: ghUser.login,
        github_email: primary?.email ?? null,
        github_token: accessToken,
      })
      .select("id")
      .single();
    if (error || !created) return fail("user_create_failed");
    userId = (created as { id: string }).id;
  }

  const res = NextResponse.redirect(`${env.appUrl()}/dashboard`);
  res.cookies.set("duplex_oauth_state", "", { maxAge: 0, path: "/" });
  // Set via the cookies API (never a raw Set-Cookie append): raw appends get
  // mangled when combined with other Set-Cookie headers and the browser
  // silently drops the session cookie.
  res.cookies.set(COOKIE_NAME, createSessionValue(userId), {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    maxAge: MAX_AGE_SECONDS,
    secure: process.env.NODE_ENV === "production",
  });
  return res;
}
