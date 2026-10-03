import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { COOKIE_NAME } from "@/lib/session";

/** GET /api/auth/logout — clear the session and go home. */
export async function GET() {
  const res = NextResponse.redirect(`${env.appUrl()}/`);
  res.cookies.set(COOKIE_NAME, "", { maxAge: 0, path: "/" });
  return res;
}
