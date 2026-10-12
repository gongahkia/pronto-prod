import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { recordAuditLog } from "@/lib/audit";
import { acknowledgeErrorEvent } from "@/lib/error-tracking";
import { assertSameOrigin } from "@/lib/http/csrf";

export async function POST(request: Request, context: { params: Promise<{ errorId: string }> }) {
  const csrf = assertSameOrigin(request);
  if (csrf) return csrf;
  const actor = await requireUser("operator");
  const { errorId } = await context.params;
  await acknowledgeErrorEvent(errorId, actor.userId);
  await recordAuditLog({ clientId: null, actorUserId: actor.userId,
    action: "error_event.acknowledged", targetType: "error_event", targetId: errorId });
  return NextResponse.redirect(new URL("/operator/operations", request.url), 303);
}
