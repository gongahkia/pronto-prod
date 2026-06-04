import { NextResponse } from "next/server";
import { recordAuditLog } from "@/lib/audit";
import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";

export async function POST(request: Request) {
  const user = await requireUser("client");
  if (!user.clientId) {
    return NextResponse.json({ error: "Client user has no client." }, { status: 400 });
  }

  const form = await request.formData();
  const ownerChatId = String(form.get("ownerChatId") ?? "");
  const ownerPhone = String(form.get("ownerPhone") ?? "");
  const location = String(form.get("location") ?? "");

  await query(
    `
      update clients
      set business_profile = jsonb_set(
        jsonb_set(
          jsonb_set(business_profile, '{ownerChatId}', to_jsonb($2::text), true),
          '{ownerPhone}',
          to_jsonb($4::text),
          true
        ),
        '{location}',
        to_jsonb($3::text),
        true
      ),
      updated_at = now()
      where id = $1
    `,
    [user.clientId, ownerChatId, location, ownerPhone],
  );

  await query(
    `
      update channels
      set settings = settings || $2::jsonb,
          updated_at = now()
      where client_id = $1 and kind in ('telegram', 'whatsapp')
    `,
    [user.clientId, JSON.stringify({ ownerChatId, ownerPhone })],
  );
  await recordAuditLog({
    clientId: user.clientId,
    actorUserId: user.userId,
    action: "client.settings.updated",
    targetType: "client",
    targetId: user.clientId,
    metadata: {
      fields: ["location", "ownerChatId", "ownerPhone"],
    },
  });

  return NextResponse.redirect(new URL("/client/settings", request.url), 303);
}
