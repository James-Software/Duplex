import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "./env";

const COOKIE_NAME = "duplex_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

interface SessionPayload {
  uid: string;
  exp: number;
}

function signingKey(): string {
  // Reuses the OAuth client secret as the HMAC key: high-entropy,
  // already required, never leaves the server.
  return env.githubClientSecret();
}

function b64urlEncode(s: string): string {
  return Buffer.from(s, "utf8").toString("base64url");
}

function b64urlDecode(s: string): string {
  return Buffer.from(s, "base64url").toString("utf8");
}

/** Create a `Set-Cookie` value for the given user id. */
export function createSessionCookie(userId: string): string {
  const payload: SessionPayload = {
    uid: userId,
    exp: Math.floor(Date.now() / 1000) + MAX_AGE_SECONDS,
  };
  const body = b64urlEncode(JSON.stringify(payload));
  const sig = createHmac("sha256", signingKey()).update(body).digest("base64url");
  return `${COOKIE_NAME}=${body}.${sig}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${MAX_AGE_SECONDS}; ${
    process.env.NODE_ENV === "production" ? "Secure;" : ""
  }`;
}

/** Verify a session cookie value; returns the user id or null. */
export function verifySessionCookie(cookieValue: string | undefined): string | null {
  if (!cookieValue) return null;
  const [body, sig] = cookieValue.split(".");
  if (!body || !sig) return null;
  const expected = createHmac("sha256", signingKey()).update(body).digest("base64url");
  const a = Buffer.from(sig, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(b64urlDecode(body)) as SessionPayload;
    if (typeof payload.uid !== "string" || typeof payload.exp !== "number") return null;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload.uid;
  } catch {
    return null;
  }
}

export function clearSessionCookie(): string {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; ${
    process.env.NODE_ENV === "production" ? "Secure;" : ""
  }`;
}

export { COOKIE_NAME };
