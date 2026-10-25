import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { recordAuditLog } from "@/lib/audit";
import { transaction } from "@/lib/db";
import { assertSameOrigin } from "@/lib/http/csrf";
import { approvedChopeBookingLink } from "@/lib/reservations/chope";

export async function POST(request: Request, context: { params: Promise<{ clientId: string }> }) {
  const csrf = assertSameOrigin(request);
  if (csrf) return csrf;
  const user = await requireUser("operator");
  const { clientId } = await context.params;
  const form = await request.formData();
  const action = String(form.get("action") ?? "save");
  const outletId = String(form.get("outletId") ?? "").trim();
  const url = String(form.get("url") ?? "").trim();
  const verified = String(form.get("verified") ?? "") === "yes";
  if (action !== "clear" && (!verified || !approvedChopeBookingLink({
    chopeBooking: { outletId, url, verifiedAt: new Date().toISOString() },
  }))) {
    return NextResponse.json({ error: "Verify the exact Chope outlet link before saving." }, { status: 400 });
  }
  await transaction(async (db) => {
    const client = await db.query<{ id: string }>("select id from clients where id = $1 for update", [clientId]);
    if (!client.rows[0]) throw new Error("Client not found.");
    if (action === "clear") {
      await db.query("update clients set business_profile = business_profile - 'chopeBooking', updated_at = now() where id = $1", [clientId]);
    } else {
      await db.query(
        `update clients set business_profile = jsonb_set(business_profile, '{chopeBooking}', $2::jsonb, true),
          updated_at = now() where id = $1`,
        [clientId, JSON.stringify({ outletId, url, verifiedAt: new Date().toISOString(), verifiedBy: user.userId })],
      );
    }
    await recordAuditLog({ clientId, actorUserId: user.userId,
      action: action === "clear" ? "chope_link.cleared" : "chope_link.verified",
      targetType: "client", targetId: clientId,
      metadata: action === "clear" ? {} : { outletId, url },
    }, db);
  });
  return NextResponse.json({ ok: true, clientId });
}
