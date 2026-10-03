import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createSessionCookie, verifySessionCookie, COOKIE_NAME } from "@/lib/session";
import { getSessionUser } from "@/lib/auth";

/**
 * TEMPORARY diagnostic for the 2026-10-03 auth bug. DELETE AFTER USE.
 * step=set: issues a real signed duplex_session cookie (probe user id).
 * step=check: echoes raw Cookie header, all values, verify + getSessionUser results.
 */
export async function GET(request: Request) {
  const step = new URL(request.url).searchParams.get("step");
  if (step === "set") {
    const setCookie = createSessionCookie("debug-probe");
    const res = NextResponse.json({ setCookieHeader: setCookie });
    res.headers.append("Set-Cookie", setCookie);
    return res;
  }
  if (step === "check") {
    const raw = request.headers.get("cookie");
    const jar = await cookies();
    const all = jar.getAll(COOKIE_NAME).map((c) => c.value);
    const verified = verifySessionCookie(jar.get(COOKIE_NAME)?.value);
    let sessionUser: string | null = null;
    try {
      const u = await getSessionUser();
      sessionUser = u ? `${u.id} (${u.github_username})` : null;
    } catch (e) {
      sessionUser = `THREW: ${e instanceof Error ? e.message : String(e)}`;
    }
    return NextResponse.json({ rawCookieHeader: raw, allValues: all, verifiedUserId: verified, sessionUser });
  }
  return NextResponse.json({ usage: "?step=set then ?step=check" });
}
