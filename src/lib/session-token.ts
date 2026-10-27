import { createHmac, timingSafeEqual } from "node:crypto";
import type { UserRole } from "@/lib/types";

// Signing and verification only (no database, no next/headers) so the request proxy can read a session too.
export const SESSION_COOKIE_NAME = "pronto_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;
const LOCAL_AUTH_SECRET = "local-dev-secret-change-me";

export type SessionUser = {
  userId: string;
  email: string;
  name: string;
  role: UserRole;
  clientId: string | null;
};

export type SessionPayload = SessionUser & {
  exp: number;
  sv: number;
};

function authSecret(): string {
  const secret = process.env.AUTH_SECRET ?? LOCAL_AUTH_SECRET;
  if (process.env.NODE_ENV === "production" && secret === LOCAL_AUTH_SECRET) {
    throw new Error("AUTH_SECRET must be set to a non-default value in production.");
  }
  return secret;
}

function sign(value: string): string {
  return createHmac("sha256", authSecret()).update(value).digest("base64url");
}

export function encodeSession(payload: SessionPayload): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(body)}`;
}

export function decodeSession(cookieValue: string | undefined): SessionPayload | null {
  if (!cookieValue) {
    return null;
  }

  const [body, signature] = cookieValue.split(".");
  if (!body || !signature) {
    return null;
  }

  const expected = sign(body);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (
    actualBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(actualBuffer, expectedBuffer)
  ) {
    return null;
  }

  const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) {
    return null;
  }

  return payload;
}
