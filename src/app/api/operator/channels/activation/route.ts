import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { activateCustomerChannel } from "@/lib/channel-activation";
import { checkChannelDraft, publishChannelDraft } from "@/lib/client-channel-drafts";
import { assertSameOrigin } from "@/lib/http/csrf";
import { channelEvidenceKinds, recordChannelActivationEvidence } from "@/lib/managed-approvals";

export async function POST(request: Request) {
  const csrf = assertSameOrigin(request);
  if (csrf) return csrf;
  const actor = await requireUser("operator");
  const form = await request.formData();
  const clientId = String(form.get("clientId") ?? "");
  const channelId = String(form.get("channelId") ?? "");
  const revision = String(form.get("revision") ?? "");
  const action = String(form.get("action") ?? "");
  try {
    if (action === "evidence") {
      const checkKind = String(form.get("checkKind") ?? "");
      if (!(channelEvidenceKinds as readonly string[]).includes(checkKind))
        return NextResponse.json({ error: "Invalid evidence type." }, { status: 400 });
      await recordChannelActivationEvidence({ actor, clientId, channelId, revision,
        checkKind: checkKind as typeof channelEvidenceKinds[number], details: String(form.get("details") ?? "") });
    } else if (action === "activate") {
      await activateCustomerChannel({ actor, clientId, channelId, revision });
    } else if (action === "publish_draft") {
      await publishChannelDraft({ clientId, channelId, actorUserId: actor.userId });
    } else if (action === "check_draft") {
      await checkChannelDraft(clientId, channelId);
    } else return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Activation failed." }, { status: 409 });
  }
  return NextResponse.redirect(new URL(`/operator/clients/${clientId}/channels`, request.url), 303);
}
