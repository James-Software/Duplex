import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { clearSessionCookie } from "@/lib/session";

/** GET /api/auth/logout — clear the session and go home. */
export async function GET() {
  const res = NextResponse.redirect(`${env.appUrl()}/`);
  res.headers.append("Set-Cookie", clearSessionCookie());
  return res;
}
