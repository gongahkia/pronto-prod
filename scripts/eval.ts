import { readFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { getPool } from "../src/lib/db";
import { processInboundMessage } from "../src/lib/channels/process";
import type { Message } from "../src/lib/types";

type GoldenEvalCase = {
  name: string;
  question: string;
  expectedAction: "answered" | "escalated";
  expectedReasonCode?: string;
  requiresCitations?: boolean;
};

type EvalResult = {
  name: string;
  passed: boolean;
  actualAction: string | null;
  actualReasonCode: string | null;
  responseText: string | null;
  citedChunkIds: string[];
  escalationId: string | null;
  details: Record<string, unknown>;
};

async function main() {
  const evalFile = process.env.EVAL_FILE ?? "evals/pronto-fnb-golden.json";
  const clientSlug = process.env.EVAL_CLIENT_SLUG ?? "north-bridge-nasi";
  const cases = JSON.parse(
    await readFile(path.resolve(process.cwd(), evalFile), "utf8"),
  ) as GoldenEvalCase[];
  const pool = getPool();

  const client = await pool.query<{ id: string; name: string }>(
    "select id, name from clients where slug = $1",
    [clientSlug],
  );
  if (!client.rows[0]) {
    throw new Error(`No client found for slug ${clientSlug}. Run db:seed first.`);
  }

  const channel = await pool.query<{ id: string }>(
    `
      select id from channels
      where client_id = $1 and kind = 'email'
      order by created_at asc
      limit 1
    `,
    [client.rows[0].id],
  );
  if (!channel.rows[0]) {
    throw new Error(`No email channel found for ${clientSlug}.`);
  }

  const run = await pool.query<{ id: string }>(
    `
      insert into eval_runs (client_id, name, total, metadata)
      values ($1, $2, $3, $4)
      returning id
    `,
    [
      client.rows[0].id,
      path.basename(evalFile),
      cases.length,
      { file: evalFile, clientSlug },
    ],
  );

  const runId = run.rows[0].id;
  const runToken = randomUUID();
  const results: EvalResult[] = [];

  for (const [index, testCase] of cases.entries()) {
    const processed = await processInboundMessage({
      channelId: channel.rows[0].id,
      channelKind: "email",
      externalMessageId: `eval-${runToken}-${index}`,
      externalThreadId: `eval-${runToken}-${testCase.name}`,
      customerHandle: "eval-runner",
      customerName: "Golden Eval",
      text: testCase.question,
      raw: { source: "eval", runId, name: testCase.name },
    });

    const citedChunkIds = processed.conversationId
      ? await loadLatestAgentCitations(processed.conversationId)
      : [];
    const result = evaluateCase(testCase, {
      actualAction: processed.action ?? null,
      actualReasonCode: processed.reasonCode ?? null,
      responseText: processed.responseText ?? null,
      citedChunkIds,
      escalationId: processed.action === "escalated" ? null : null,
    });

    await pool.query(
      `
        insert into eval_results (
          run_id,
          client_id,
          name,
          question,
          expected_action,
          expected_reason_code,
          actual_action,
          actual_reason_code,
          response_text,
          cited_chunk_ids,
          escalation_id,
          passed,
          details
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      `,
      [
        runId,
        client.rows[0].id,
        testCase.name,
        testCase.question,
        testCase.expectedAction,
        testCase.expectedReasonCode ?? null,
        result.actualAction,
        result.actualReasonCode,
        result.responseText,
        result.citedChunkIds,
        result.escalationId,
        result.passed,
        result.details,
      ],
    );

    results.push({ name: testCase.name, ...result });
  }

  const passed = results.filter((result) => result.passed).length;
  const failed = results.length - passed;
  await pool.query(
    `
      update eval_runs
      set status = $2, passed = $3, failed = $4, completed_at = now()
      where id = $1
    `,
    [runId, failed ? "failed" : "passed", passed, failed],
  );

  for (const result of results) {
    const marker = result.passed ? "PASS" : "FAIL";
    console.log(
      `${marker} ${result.name} expected=${cases.find((item) => item.name === result.name)?.expectedAction} actual=${result.actualAction} reason=${result.actualReasonCode}`,
    );
  }
  console.log(`Eval run ${runId}: ${passed}/${results.length} passed`);

  await pool.end();
  if (failed) {
    process.exit(1);
  }
}

async function loadLatestAgentCitations(conversationId: string): Promise<string[]> {
  const pool = getPool();
  const result = await pool.query<Message>(
    `
      select * from messages
      where conversation_id = $1 and sender_role = 'agent'
      order by created_at desc
      limit 1
    `,
    [conversationId],
  );
  const cited = result.rows[0]?.metadata?.citedChunkIds;
  return Array.isArray(cited) ? cited.filter((item) => typeof item === "string") : [];
}

function evaluateCase(
  testCase: GoldenEvalCase,
  actual: Omit<EvalResult, "name" | "passed" | "details">,
): Omit<EvalResult, "name"> {
  const failures: string[] = [];
  if (actual.actualAction !== testCase.expectedAction) {
    failures.push(`expected action ${testCase.expectedAction}, got ${actual.actualAction}`);
  }
  if (
    testCase.expectedReasonCode &&
    actual.actualReasonCode !== testCase.expectedReasonCode
  ) {
    failures.push(
      `expected reason ${testCase.expectedReasonCode}, got ${actual.actualReasonCode}`,
    );
  }
  if (
    testCase.expectedAction === "answered" &&
    testCase.requiresCitations !== false &&
    actual.citedChunkIds.length === 0
  ) {
    failures.push("answered without cited source chunks");
  }
  if (testCase.expectedAction === "answered" && !actual.responseText) {
    failures.push("answered without response text");
  }

  return {
    ...actual,
    passed: failures.length === 0,
    details: { failures },
  };
}

main().catch(async (error) => {
  console.error(error);
  await getPool().end();
  process.exit(1);
});
