import { assertSameOrigin } from "@/lib/http/csrf";
import { NextResponse } from "next/server";
import { recordAuditLog } from "@/lib/audit";
import { requireUser } from "@/lib/auth";
import {
  buildClientOffboardingExport,
  deleteClientForOffboarding,
} from "@/lib/offboarding";
import { canAccessClient } from "@/lib/rbac";

export async function POST(request: Request) {
  const csrf = assertSameOrigin(request);
  if (csrf) return csrf;

  const user = await requireUser("operator");
  const form = await request.formData();
  const action = String(form.get("action") ?? "");
  const clientId = String(form.get("clientId") ?? "");

  if (!clientId) {
    return NextResponse.json({ error: "clientId is required." }, { status: 400 });
  }
  if (!canAccessClient(user, clientId)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  if (action === "export") {
    const exported = await buildClientOffboardingExport(clientId);
    await recordAuditLog({
      clientId,
      actorUserId: user.userId,
      action: "client.offboarding_exported",
      targetType: "client",
      targetId: clientId,
      metadata: {
        slug: exported.client.slug,
        exportedAt: exported.exportedAt,
      },
    });
    return new Response(JSON.stringify(exported, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${exported.client.slug}-offboarding-export.json"`,
      },
    });
  }

  if (action === "delete") {
    const confirmSlug = String(form.get("confirmSlug") ?? "");
    await deleteClientForOffboarding({
      clientId,
      confirmSlug,
      actorUserId: user.userId,
    });
    return NextResponse.redirect(new URL("/operator", request.url), 303);
  }

  return NextResponse.json({ error: "Unsupported offboarding action." }, { status: 400 });
}
