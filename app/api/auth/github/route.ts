import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { env } from "@/lib/env";

/**
 * GET /api/auth/github — start the GitHub OAuth flow.
 * Redirects to github.com/login/oauth/authorize.
 */
export async function GET() {
  const state = randomBytes(16).toString("hex");
  const params = new URLSearchParams({
    client_id: env.githubClientId(),
    redirect_uri: `${env.appUrl()}/api/auth/callback`,
    scope: "read:user user:email repo",
    state,
  });
  const res = NextResponse.redirect(
    `https://github.com/login/oauth/authorize?${params.toString()}`
  );
  res.cookies.set("duplex_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 600,
    secure: process.env.NODE_ENV === "production",
  });
  return res;
}
