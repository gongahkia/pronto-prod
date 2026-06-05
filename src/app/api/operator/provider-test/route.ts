import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getGenerationProvider } from "@/lib/llm";
import { selectModel } from "@/lib/llm/catalog";
import {
  credentialEncryptionConfigured,
  upsertProviderApiKey,
} from "@/lib/llm/credentials";
import { selectableFreeProviders } from "@/lib/llm/free-providers";
import {
  logWarn,
  redactErrorMessage,
  requestIdFromRequest,
  requestIdHeaders,
} from "@/lib/logger";

export async function POST(request: Request) {
  const requestId = requestIdFromRequest(request);
  const user = await requireUser("operator");
  const payload = (await request.json()) as {
    provider?: string;
    model?: string;
    apiKey?: string;
  };
  const provider = String(payload.provider ?? "mock").trim();
  const model = String(payload.model ?? "").trim();
  const apiKey = String(payload.apiKey ?? "").trim();

  if (!isAllowedResponseProvider(provider)) {
    return NextResponse.json(
      { error: "Response provider is not supported." },
      { status: 400, headers: requestIdHeaders(requestId) },
    );
  }
  if (apiKey && !credentialEncryptionConfigured()) {
    return NextResponse.json(
      { error: "PRONTO_SECRETS_KEY is required before provider API keys can be saved." },
      { status: 400, headers: requestIdHeaders(requestId) },
    );
  }
  if (apiKey) {
    await upsertProviderApiKey({ provider, apiKey, actorUserId: user.userId });
  }

  const modelChoice = selectModel({
    provider,
    configuredModel: model || undefined,
    task: "agent_answer",
  });

  try {
    const decision = await getGenerationProvider(modelChoice.provider).generateGroundedAnswer({
      requestId,
      clientId: "provider-test-client",
      conversationId: "provider-test-conversation",
      clientName: "North Bridge Nasi",
      brandVoice: "Warm, quick, practical, and Singapore-aware.",
      promptPreamble: "Answer only from verified source material.",
      customerMessage: "What time are you open on Saturday?",
      recentMessages: [],
      retrievedChunks: [
        {
          id: "provider-test-chunk",
          source_id: "provider-test-source",
          client_id: "provider-test-client",
          chunk_index: 0,
          content: "Saturday and Sunday: 10:00 AM to 10:00 PM.",
          token_estimate: 12,
          score: 0.92,
          metadata: { providerTest: true },
        },
      ],
      responseModel: modelChoice.model,
    });

    return NextResponse.json(
      {
        ok: true,
        provider: modelChoice.provider,
        model: modelChoice.model,
        decision,
      },
      { headers: requestIdHeaders(requestId) },
    );
  } catch (error) {
    logWarn("llm_provider.test_failed", {
      requestId,
      provider,
      model: modelChoice.model,
      error: redactErrorMessage(error),
    });
    return NextResponse.json(
      {
        ok: false,
        provider,
        model: modelChoice.model,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 502, headers: requestIdHeaders(requestId) },
    );
  }
}

function isAllowedResponseProvider(value: string): boolean {
  return (
    value === "mock" ||
    value === "openai" ||
    value === "anthropic" ||
    selectableFreeProviders().some((provider) => provider.id === value)
  );
}
