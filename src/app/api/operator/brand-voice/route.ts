import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import {
  addBrandVoiceExample,
  deleteBrandVoiceExample,
  parseBrandVoiceAttributes,
  setBrandVoiceExampleActive,
  updateBrandVoiceDocument,
} from "@/lib/brand-voice";
import { logWarn } from "@/lib/logger";

export async function POST(request: Request) {
  const user = await requireUser("operator");
  const form = await request.formData();
  const clientId = String(form.get("clientId") ?? "");
  const action = String(form.get("action") ?? "");
  const returnTo = safeOperatorReturnPath(
    String(form.get("returnTo") ?? ""),
    clientId ? `/operator/clients/${clientId}` : "/operator",
  );

  if (!clientId) {
    return NextResponse.json({ error: "clientId is required." }, { status: 400 });
  }

  if (action === "update_document") {
    const title = String(form.get("title") ?? "").trim();
    const content = String(form.get("content") ?? "").trim();
    const sourceNotes = String(form.get("sourceNotes") ?? "").trim();
    if (!title || !content) {
      return NextResponse.json(
        { error: "Brand voice title and content are required." },
        { status: 400 },
      );
    }

    let attributes: Record<string, unknown>;
    try {
      attributes = parseBrandVoiceAttributes(String(form.get("attributes") ?? ""));
    } catch (error) {
      logWarn("brand_voice.invalid_attributes_json", {
        actorUserId: user.userId,
        clientId,
        error,
      });
      return NextResponse.json(
        { error: "Brand voice attributes must be valid JSON." },
        { status: 400 },
      );
    }

    const updated = await updateBrandVoiceDocument({
      clientId,
      title,
      content,
      attributes,
      sourceNotes,
      actorUserId: user.userId,
    });
    if (!updated) {
      return NextResponse.json({ error: "Client not found." }, { status: 404 });
    }
    return NextResponse.redirect(new URL(returnTo, request.url), 303);
  }

  if (action === "add_example") {
    const customerMessage = String(form.get("customerMessage") ?? "").trim();
    const idealResponse = String(form.get("idealResponse") ?? "").trim();
    const notes = String(form.get("notes") ?? "").trim();
    if (!customerMessage || !idealResponse) {
      return NextResponse.json(
        { error: "Customer message and ideal response are required." },
        { status: 400 },
      );
    }
    const example = await addBrandVoiceExample({
      clientId,
      customerMessage,
      idealResponse,
      notes,
      actorUserId: user.userId,
    });
    if (!example) {
      return NextResponse.json({ error: "Client not found." }, { status: 404 });
    }
    return NextResponse.redirect(new URL(returnTo, request.url), 303);
  }

  if (action === "toggle_example") {
    const exampleId = String(form.get("exampleId") ?? "");
    const isActive = form.get("isActive") === "true";
    const updated = await setBrandVoiceExampleActive({
      clientId,
      exampleId,
      isActive,
      actorUserId: user.userId,
    });
    if (!updated) {
      return NextResponse.json({ error: "Brand voice example not found." }, { status: 404 });
    }
    return NextResponse.redirect(new URL(returnTo, request.url), 303);
  }

  if (action === "delete_example") {
    const exampleId = String(form.get("exampleId") ?? "");
    const deleted = await deleteBrandVoiceExample({
      clientId,
      exampleId,
      actorUserId: user.userId,
    });
    if (!deleted) {
      return NextResponse.json({ error: "Brand voice example not found." }, { status: 404 });
    }
    return NextResponse.redirect(new URL(returnTo, request.url), 303);
  }

  return NextResponse.json({ error: "Unsupported brand voice action." }, { status: 400 });
}

function safeOperatorReturnPath(value: string, fallback: string): string {
  return value.startsWith("/operator") && !value.startsWith("//") ? value : fallback;
}
