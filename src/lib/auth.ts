import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { recordAuditLog } from "@/lib/audit";
import { query } from "@/lib/db";
import { verifyPassword } from "@/lib/password";
import type { User, UserRole } from "@/lib/types";

const COOKIE_NAME = "pronto_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;
const LOCAL_AUTH_SECRET = "local-dev-secret-change-me";

export type SessionUser = {
  userId: string;
  email: string;
  name: string;
  role: UserRole;
  clientId: string | null;
};

type SessionPayload = SessionUser & {
  exp: number;
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

function encodeSession(payload: SessionPayload): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(body)}`;
}

function decodeSession(cookieValue: string | undefined): SessionPayload | null {
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

export async function getSessionUser(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const payload = decodeSession(cookieStore.get(COOKIE_NAME)?.value);
  if (!payload) {
    return null;
  }

  return {
    userId: payload.userId,
    email: payload.email,
    name: payload.name,
    role: payload.role,
    clientId: payload.clientId,
  };
}

export async function requireUser(role?: UserRole): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user || (role && user.role !== role)) {
    redirect("/login");
  }
  return user;
}

export async function login(email: string, password: string): Promise<SessionUser | null> {
  const normalizedEmail = email.toLowerCase();
  const result = await query<User>("select * from users where email = $1", [
    normalizedEmail,
  ]);
  const user = result.rows[0];
  if (!user) {
    await recordAuditLog({
      clientId: null,
      actorUserId: null,
      action: "auth.login_failed",
      targetType: "user",
      metadata: { email: normalizedEmail, reason: "user_not_found" },
    });
    return null;
  }

  const valid = await verifyPassword(password, user.password_hash);
  if (!valid) {
    await recordAuditLog({
      clientId: user.client_id,
      actorUserId: user.id,
      action: "auth.login_failed",
      targetType: "user",
      targetId: user.id,
      metadata: { email: user.email, reason: "invalid_password" },
    });
    return null;
  }

  const sessionUser: SessionUser = {
    userId: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    clientId: user.client_id,
  };

  const cookieStore = await cookies();
  cookieStore.set(
    COOKIE_NAME,
    encodeSession({
      ...sessionUser,
      exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
    }),
    {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: SESSION_TTL_SECONDS,
      path: "/",
    },
  );

  await recordAuditLog({
    clientId: user.client_id,
    actorUserId: user.id,
    action: "auth.login_succeeded",
    targetType: "user",
    targetId: user.id,
    metadata: { email: user.email, role: user.role },
  });

  return sessionUser;
}

export async function logout(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}
