import { assertSameOrigin } from "@/lib/http/csrf";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { updateAgentConfigForClient } from "@/lib/agent/config";
import { logWarn } from "@/lib/logger";
import { canAccessClient } from "@/lib/rbac";

export async function POST(request: Request) {
  const csrf = assertSameOrigin(request);
  if (csrf) return csrf;

  const user = await requireUser("operator");
  const form = await request.formData();
  const clientId = String(form.get("clientId") ?? "");
  const promptPreamble = String(form.get("promptPreamble") ?? "").trim();
  const escalationRulesJson = String(form.get("escalationRules") ?? "").trim();
  const changeReason = String(form.get("changeReason") ?? "").trim();
  const responseProvider = String(form.get("responseProvider") ?? "openai").trim();
  const responseModel = String(form.get("responseModel") ?? "").trim();
  const embeddingProvider = String(form.get("embeddingProvider") ?? "openai").trim();
  const embeddingModel = String(form.get("embeddingModel") ?? "").trim();
  const returnTo = safeOperatorReturnPath(
    String(form.get("returnTo") ?? ""),
    clientId ? `/operator/clients/${clientId}` : "/operator",
  );

  if (!clientId) {
    return NextResponse.json({ error: "clientId is required." }, { status: 400 });
  }
  if (!canAccessClient(user, clientId)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  if (!isAllowedResponseProvider(responseProvider)) {
    logWarn("agent_config.invalid_response_provider", {
      actorUserId: user.userId,
      clientId,
      responseProvider,
    });
    return NextResponse.json({ error: "Response provider is not supported." }, { status: 400 });
  }

  if (!["mock", "openai", "azure"].includes(embeddingProvider)) {
    logWarn("agent_config.invalid_embedding_provider", {
      actorUserId: user.userId,
      clientId,
      embeddingProvider,
    });
    return NextResponse.json({ error: "Embedding provider must be mock, openai, or azure." }, { status: 400 });
  }

  if (!isSafeModelName(responseModel) || !isSafeModelName(embeddingModel)) {
    return NextResponse.json(
      { error: "Provider model names are required and must be 160 characters or fewer." },
      { status: 400 },
    );
  }

  const retrievalThreshold = Number(String(form.get("retrievalThreshold") ?? ""));
  if (!Number.isFinite(retrievalThreshold) || retrievalThreshold < 0 || retrievalThreshold > 1) {
    logWarn("agent_config.invalid_retrieval_threshold", {
      actorUserId: user.userId,
      clientId,
      retrievalThreshold: String(form.get("retrievalThreshold") ?? ""),
    });
    return NextResponse.json(
      { error: "Retrieval threshold must be a number from 0 to 1." },
      { status: 400 },
    );
  }

  if (!promptPreamble || promptPreamble.length > 4000) {
    return NextResponse.json(
      { error: "Prompt preamble is required and must be 4000 characters or fewer." },
      { status: 400 },
    );
  }

  let escalationRules: Record<string, unknown>;
  try {
    escalationRules = parseJsonObject(escalationRulesJson || "{}");
  } catch (error) {
    logWarn("agent_config.invalid_escalation_rules_json", {
      actorUserId: user.userId,
      clientId,
      error,
    });
    return NextResponse.json(
      { error: "Escalation rules must be a valid JSON object." },
      { status: 400 },
    );
  }

  const updated = await updateAgentConfigForClient({
    clientId,
    responseProvider,
    responseModel,
    embeddingProvider,
    embeddingModel,
    retrievalThreshold,
    promptPreamble,
    escalationRules,
    actorUserId: user.userId,
    changeReason,
  });
  if (!updated) {
    return NextResponse.json({ error: "Agent config not found." }, { status: 404 });
  }

  return NextResponse.redirect(new URL(returnTo, request.url), 303);
}

function parseJsonObject(value: string): Record<string, unknown> {
  const parsed = JSON.parse(value);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Expected a JSON object.");
  }
  return parsed as Record<string, unknown>;
}

function safeOperatorReturnPath(value: string, fallback: string): string {
  return value.startsWith("/operator") && !value.startsWith("//") ? value : fallback;
}

function isAllowedResponseProvider(value: string): boolean {
  return (
    value === "mock" ||
    value === "openai" ||
    value === "azure" ||
    value === "anthropic"
  );
}

function isSafeModelName(value: string): boolean {
  return Boolean(value) && value.length <= 160 && /^[a-zA-Z0-9_.:/@+-]+$/.test(value);
}
