import { assertSameOrigin } from "@/lib/http/csrf";
import { NextResponse } from "next/server";
import { recordAuditLog } from "@/lib/audit";
import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { canAccessClient } from "@/lib/rbac";

type Context = { params: Promise<{ clientId: string; userId: string }> };

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
  const csrf = assertSameOrigin(request);
  if (csrf) return csrf;

  const actor = await requireUser("operator");
  const { clientId, userId } = await context.params;
  if (!canAccessClient(actor, clientId)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  if (userId === actor.userId) {
    return redirectWithMessage(request, clientId, "error", "You cannot remove yourself.");
  }

  const target = await query<{ id: string; email: string; role: string }>(
    `select id, email, role from users where id = $1 and client_id = $2 limit 1`,
    [userId, clientId],
  );
  const user = target.rows[0];
  if (!user) {
    return redirectWithMessage(request, clientId, "error", "User not found for this client.");
  }

  await query(`delete from users where id = $1`, [userId]);

  await recordAuditLog({
    clientId,
    actorUserId: actor.userId,
    action: "client_user.deleted",
    targetType: "user",
    targetId: userId,
    metadata: { email: user.email, role: user.role },
  });

  return redirectWithMessage(request, clientId, "ok", `Removed ${user.email}.`);
}
