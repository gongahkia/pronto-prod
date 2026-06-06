import { readFile } from "node:fs/promises";
import path from "node:path";
import { getPool } from "../src/lib/db";
import { buildAssistantContext } from "../src/lib/assistant/context";
import { generateAssistantTurn } from "../src/lib/assistant/llm";
import { isAssistantActionAllowedForUser } from "../src/lib/assistant/actions";
import type { SessionUser } from "../src/lib/auth";
import type { AssistantActionType, AssistantIntent, AssistantRoleMode } from "../src/lib/assistant/types";

type AssistantEvalCase = {
  name: string;
  role: "operator" | "client";
  prompt: string;
  pagePath?: string;
  clientId?: string;
  expectedIntent?: AssistantIntent;
  expectedRoleMode?: AssistantRoleMode;
  expectedFocusedClientId?: string;
  expectedProposalType?: AssistantActionType;
  forbiddenProposalType?: AssistantActionType;
  expectsFocusedConversation?: boolean;
  expectedCitationType?: string;
  expectedFocusedRecordType?: string;
  forbiddenRecordClientId?: string;
  expectedAnswerIncludes?: string;
};

type EvalFixtures = {
  clientId: string;
  clientName: string;
  conversationId: string;
  otherClientId: string;
};

type EvalResult = {
  name: string;
  passed: boolean;
  failures: string[];
};

async function main() {
  if (process.env.ASSISTANT_EVAL_LIVE !== "1") {
    process.env.PRONTO_USE_MOCK_AI = "1";
    process.env.PRONTO_ASSISTANT_LLM_PROVIDER = "mock";
  }

  const evalFile = process.env.ASSISTANT_EVAL_FILE ?? "evals/pronto-assistant.json";
  const cases = JSON.parse(
    await readFile(path.resolve(process.cwd(), evalFile), "utf8"),
  ) as AssistantEvalCase[];
  const fixtures = await loadFixtures();
  const results: EvalResult[] = [];

  for (const testCase of cases) {
    const materialized = materializeCase(testCase, fixtures);
    const user = userForCase(materialized, fixtures);
    const context = await buildAssistantContext({
      user,
      message: materialized.prompt,
      pagePath: materialized.pagePath ?? null,
      clientId: materialized.clientId ?? null,
    });
    const generated = await generateAssistantTurn({
      context,
      message: materialized.prompt,
    });
    const safeProposals = generated.actionProposals.filter((proposal) =>
      isAssistantActionAllowedForUser(user, proposal.actionType),
    );
    const result = evaluateCase(materialized, {
      context,
      answer: generated.answer,
      proposalTypes: safeProposals.map((proposal) => proposal.actionType),
      citationTypes: generated.citedRecords.map((citation) => citation.type),
    });
    results.push(result);
  }

  for (const result of results) {
    const marker = result.passed ? "PASS" : "FAIL";
    console.log(`${marker} ${result.name}`);
    for (const failure of result.failures) {
      console.log(`  - ${failure}`);
    }
  }

  const passed = results.filter((result) => result.passed).length;
  console.log(`Assistant eval: ${passed}/${results.length} passed`);
  await getPool().end();
  if (passed !== results.length) {
    process.exit(1);
  }
}

async function loadFixtures(): Promise<EvalFixtures> {
  const pool = getPool();
  const clientSlug = process.env.ASSISTANT_EVAL_CLIENT_SLUG ?? "north-bridge-nasi";
  const client = await pool.query<{ id: string; name: string }>(
    "select id, name from clients where slug = $1",
    [clientSlug],
  );
  if (!client.rows[0]) {
    throw new Error(`No client found for slug ${clientSlug}. Run pnpm migrate && pnpm seed first.`);
  }

  const conversation = await pool.query<{ id: string }>(
    `
      select id
      from conversations
      where client_id = $1
      order by last_message_at desc nulls last, created_at desc
      limit 1
    `,
    [client.rows[0].id],
  );
  if (!conversation.rows[0]) {
    throw new Error(`No conversations found for ${clientSlug}. Run pnpm seed first.`);
  }

  const otherClient = await pool.query<{ id: string }>(
    `
      select id
      from clients
      where id <> $1
      order by created_at asc
      limit 1
    `,
    [client.rows[0].id],
  );

  return {
    clientId: client.rows[0].id,
    clientName: client.rows[0].name,
    conversationId: conversation.rows[0].id,
    otherClientId: otherClient.rows[0]?.id ?? "00000000-0000-0000-0000-000000000000",
  };
}

function materializeCase(
  testCase: AssistantEvalCase,
  fixtures: EvalFixtures,
): AssistantEvalCase {
  return {
    ...testCase,
    prompt: replacePlaceholders(testCase.prompt, fixtures),
    pagePath: testCase.pagePath ? replacePlaceholders(testCase.pagePath, fixtures) : undefined,
    clientId: testCase.clientId ? replacePlaceholders(testCase.clientId, fixtures) : undefined,
    expectedFocusedClientId: testCase.expectedFocusedClientId
      ? replacePlaceholders(testCase.expectedFocusedClientId, fixtures)
      : undefined,
    forbiddenRecordClientId: testCase.forbiddenRecordClientId
      ? replacePlaceholders(testCase.forbiddenRecordClientId, fixtures)
      : undefined,
  };
}

function replacePlaceholders(value: string, fixtures: EvalFixtures): string {
  return value
    .replace(/\{clientId\}/g, fixtures.clientId)
    .replace(/\{clientName\}/g, fixtures.clientName)
    .replace(/\{conversationId\}/g, fixtures.conversationId)
    .replace(/\{otherClientId\}/g, fixtures.otherClientId);
}

function userForCase(testCase: AssistantEvalCase, fixtures: EvalFixtures): SessionUser {
  if (testCase.role === "operator") {
    return {
      userId: "assistant-eval-operator",
      email: "assistant-eval-operator@pronto.local",
      name: "Assistant Eval Operator",
      role: "operator",
      clientId: null,
    };
  }
  return {
    userId: "assistant-eval-client",
    email: "assistant-eval-client@pronto.local",
    name: "Assistant Eval Client",
    role: "client",
    clientId: fixtures.clientId,
  };
}

function evaluateCase(
  testCase: AssistantEvalCase,
  actual: {
    context: Awaited<ReturnType<typeof buildAssistantContext>>;
    answer: string;
    proposalTypes: AssistantActionType[];
    citationTypes: string[];
  },
): EvalResult {
  const failures: string[] = [];
  if (testCase.expectedIntent && actual.context.intent !== testCase.expectedIntent) {
    failures.push(`expected intent ${testCase.expectedIntent}, got ${actual.context.intent}`);
  }
  if (testCase.expectedRoleMode && actual.context.roleMode !== testCase.expectedRoleMode) {
    failures.push(`expected role mode ${testCase.expectedRoleMode}, got ${actual.context.roleMode}`);
  }
  if (
    testCase.expectedFocusedClientId &&
    actual.context.focusedClientId !== testCase.expectedFocusedClientId
  ) {
    failures.push(
      `expected focused client ${testCase.expectedFocusedClientId}, got ${actual.context.focusedClientId}`,
    );
  }
  if (testCase.expectsFocusedConversation && !actual.context.focusedConversationId) {
    failures.push("expected focused conversation context");
  }
  if (
    testCase.expectedProposalType &&
    !actual.proposalTypes.includes(testCase.expectedProposalType)
  ) {
    failures.push(`expected proposal ${testCase.expectedProposalType}`);
  }
  if (
    testCase.forbiddenProposalType &&
    actual.proposalTypes.includes(testCase.forbiddenProposalType)
  ) {
    failures.push(`forbidden proposal ${testCase.forbiddenProposalType} was returned`);
  }
  if (
    testCase.expectedCitationType &&
    !actual.citationTypes.includes(testCase.expectedCitationType)
  ) {
    failures.push(`expected citation type ${testCase.expectedCitationType}`);
  }
  if (
    testCase.expectedFocusedRecordType &&
    !actual.context.focusedRecords.some((record) => record.type === testCase.expectedFocusedRecordType)
  ) {
    failures.push(`expected focused record type ${testCase.expectedFocusedRecordType}`);
  }
  if (
    testCase.forbiddenRecordClientId &&
    actual.context.records.some(
      (record) => contextRecordClientId(record.data) === testCase.forbiddenRecordClientId,
    )
  ) {
    failures.push(`context included forbidden client ${testCase.forbiddenRecordClientId}`);
  }
  if (
    testCase.expectedAnswerIncludes &&
    !actual.answer.toLowerCase().includes(testCase.expectedAnswerIncludes.toLowerCase())
  ) {
    failures.push(`expected answer to include "${testCase.expectedAnswerIncludes}"`);
  }

  return {
    name: testCase.name,
    passed: failures.length === 0,
    failures,
  };
}

function contextRecordClientId(data: Record<string, unknown>): string | null {
  if (typeof data.clientId === "string") {
    return data.clientId;
  }
  if (typeof data.client_id === "string") {
    return data.client_id;
  }
  return null;
}

main().catch(async (error) => {
  console.error(error);
  await getPool().end();
  process.exit(1);
});
