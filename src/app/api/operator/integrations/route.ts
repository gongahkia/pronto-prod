import { assertSameOrigin } from "@/lib/http/csrf";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { recordAuditLog } from "@/lib/audit";
import {
  deleteIntegrationCredential,
  upsertIntegrationCredential,
} from "@/lib/integrations/credentials";
import { credentialEncryptionConfigured } from "@/lib/llm/credentials";
import {
  getIntegrationDefinition,
  integrationLibrary,
} from "@/lib/integrations";
import type { IntegrationProvider } from "@/lib/integrations/types";
import { requestIdFromRequest, requestIdHeaders } from "@/lib/logger";

export async function POST(request: Request) {
  const csrf = assertSameOrigin(request);
  if (csrf) return csrf;

  const requestId = requestIdFromRequest(request);
  const user = await requireUser("operator");
  if (!credentialEncryptionConfigured()) {
    return NextResponse.json(
      { error: "PRONTO_SECRETS_KEY is required before integration credentials can be saved." },
      { status: 400, headers: requestIdHeaders(requestId) },
    );
  }

  const payload = (await request.json()) as {
    clientId?: string;
    provider?: string;
    label?: string;
    apiKey?: string;
    metadata?: Record<string, unknown>;
    rotationDueAt?: string;
  };
  const clientId = String(payload.clientId ?? "").trim();
  const provider = String(payload.provider ?? "").trim() as IntegrationProvider;
  const apiKey = String(payload.apiKey ?? "");

  if (!clientId || !isKnownProvider(provider)) {
    return NextResponse.json(
      { error: "Invalid client or provider." },
      { status: 400, headers: requestIdHeaders(requestId) },
    );
  }
  if (!apiKey.trim()) {
    return NextResponse.json(
      { error: "apiKey is required." },
      { status: 400, headers: requestIdHeaders(requestId) },
    );
  }

  await upsertIntegrationCredential({
    clientId,
    provider,
    apiKey,
    label: payload.label?.trim() || undefined,
    metadata: payload.metadata ?? {},
    rotationDueAt: payload.rotationDueAt ? new Date(payload.rotationDueAt) : null,
    actorUserId: user.userId,
  });
  await recordAuditLog({
    clientId,
    actorUserId: user.userId,
    action: "integration_credential.upserted",
    targetType: "integration",
    targetId: null,
    metadata: { provider, label: payload.label ?? null },
  });

  return NextResponse.json(
    { ok: true, provider, definition: getIntegrationDefinition(provider) },
    { headers: requestIdHeaders(requestId) },
  );
}

export async function DELETE(request: Request) {
  const csrf = assertSameOrigin(request);
  if (csrf) return csrf;

  const requestId = requestIdFromRequest(request);
  const user = await requireUser("operator");
  const payload = (await request.json()) as {
    clientId?: string;
    provider?: string;
    label?: string;
  };
  const clientId = String(payload.clientId ?? "").trim();
  const provider = String(payload.provider ?? "").trim() as IntegrationProvider;
  if (!clientId || !isKnownProvider(provider)) {
    return NextResponse.json(
      { error: "Invalid client or provider." },
      { status: 400, headers: requestIdHeaders(requestId) },
    );
  }

  await deleteIntegrationCredential({
    clientId,
    provider,
    label: payload.label,
  });
  await recordAuditLog({
    clientId,
    actorUserId: user.userId,
    action: "integration_credential.deleted",
    targetType: "integration",
    targetId: null,
    metadata: { provider, label: payload.label ?? null },
  });

  return NextResponse.json({ ok: true }, { headers: requestIdHeaders(requestId) });
}

function isKnownProvider(value: string): value is IntegrationProvider {
  return value in integrationLibrary;
}
