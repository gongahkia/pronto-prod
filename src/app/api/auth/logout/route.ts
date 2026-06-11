import { assertSameOrigin } from "@/lib/http/csrf";
import { NextResponse } from "next/server";
import { recordAuditLog } from "@/lib/audit";
import { getSessionUser, logout } from "@/lib/auth";

export async function POST(request: Request) {
  const csrf = assertSameOrigin(request);
  if (csrf) return csrf;

  const user = await getSessionUser();
  if (user) {
    await recordAuditLog({
      clientId: user.clientId,
      actorUserId: user.userId,
      action: "auth.logout",
      targetType: "user",
      targetId: user.userId,
      metadata: { role: user.role },
    });
  }
  await logout();
  return NextResponse.redirect(new URL("/login", request.url), 303);
}
