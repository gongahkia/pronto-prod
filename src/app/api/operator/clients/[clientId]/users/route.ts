import { NextResponse } from "next/server";
import { recordAuditLog } from "@/lib/audit";
import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { hashPassword } from "@/lib/password";

const MIN_PASSWORD_LENGTH = 8;
const VALID_ROLES = new Set(["client", "operator"]);

type Context = { params: Promise<{ clientId: string }> };

function redirectWithMessage(
  request: Request,
  clientId: string,
  key: "error" | "ok",
  message: string,
): NextResponse {
  const url = new URL(`/operator/clients/${clientId}/users`, request.url);
  url.searchParams.set(key, message);
  return NextResponse.redirect(url, 303);
}

export async function POST(request: Request, context: Context) {
  const actor = await requireUser("operator");
  const { clientId } = await context.params;

  const clientResult = await query<{ id: string }>(
    "select id from clients where id = $1 limit 1",
    [clientId],
  );
  if (!clientResult.rows[0]) {
    return NextResponse.json({ error: "Client not found." }, { status: 404 });
  }

  const form = await request.formData();
  const name = String(form.get("name") ?? "").trim();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const role = String(form.get("role") ?? "client").trim();

  if (!VALID_ROLES.has(role)) {
    return redirectWithMessage(request, clientId, "error", "Invalid role.");
  }
  if (!name || !email || !password) {
    return redirectWithMessage(
      request,
      clientId,
      "error",
      "Name, email, and password are all required.",
    );
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return redirectWithMessage(
      request,
      clientId,
      "error",
      `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
    );
  }

  const existing = await query<{ id: string }>(
    "select id from users where email = $1 limit 1",
    [email],
  );
  if (existing.rows[0]) {
    return redirectWithMessage(
      request,
      clientId,
      "error",
      "Email is already in use.",
    );
  }

  const passwordHash = await hashPassword(password);
  const inserted = await query<{ id: string }>(
    `insert into users (client_id, email, name, role, password_hash)
     values ($1, $2, $3, $4, $5)
     returning id`,
    [clientId, email, name, role, passwordHash],
  );

  await recordAuditLog({
    clientId,
    actorUserId: actor.userId,
    action: "client_user.created",
    targetType: "user",
    targetId: inserted.rows[0].id,
    metadata: { email, name, role },
  });

  return redirectWithMessage(
    request,
    clientId,
    "ok",
    `Added ${email}.`,
  );
}

