import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { assertSameOrigin } from "@/lib/http/csrf";
import { confirmStaffCommand, localStaffCommandsEnabled, parseStaffCommand,
  proposeStaffCommand, viewStaffPolicy } from "@/lib/staff-interaction";

export async function POST(request: Request) {
  const csrf = assertSameOrigin(request);
  if (csrf) return csrf;
  if (!localStaffCommandsEnabled()) return NextResponse.json({ error: "Local staff commands are disabled." }, { status: 403 });
  const actor = await requireUser("client");
  if (!actor.clientId) return NextResponse.json({ error: "Business assignment required." }, { status: 403 });
  try {
    const body = await request.json() as Record<string, unknown>;
    if (body.action === "confirm") {
      const result = await confirmStaffCommand({ actor, requestId: String(body.requestId ?? ""),
        confirmationToken: String(body.confirmationToken ?? "") });
      return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
    }
    if (body.action !== "send" || typeof body.text !== "string" || body.text.length > 9000)
      return NextResponse.json({ error: "Invalid local staff message." }, { status: 400 });
    if (parseStaffCommand(body.text) === "view_policy") {
      const result = await viewStaffPolicy(actor);
      return NextResponse.json({ state: "view", ...result }, { headers: { "Cache-Control": "no-store" } });
    }
    const result = await proposeStaffCommand({ actor, text: body.text,
      requestKey: String(body.requestKey ?? "") });
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Request could not be completed." },
      { status: 409, headers: { "Cache-Control": "no-store" } });
  }
}
