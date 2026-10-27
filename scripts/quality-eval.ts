import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { verifyTestDatabase } from "./test-db-safety";

// No live inference or email delivery: the suite injects HTTP responses and uses
// only the disposable, marked PS.Cafe console fixture. Never accept a live DB.
await verifyTestDatabase();
const reportDir = resolve("output/agent-quality");
await mkdir(reportDir, { recursive: true });
const report = resolve(reportDir,"vitest.json");
const startedAt = new Date().toISOString();
const result = spawnSync("pnpm", ["exec","vitest","run","--config","vitest.quality.config.ts","--silent","--reporter=default","--reporter=json",`--outputFile=${report}`], {
  stdio:"inherit", env:{...process.env,PRONTO_RUN_DB_TESTS:"1",PRONTO_ENFORCE_TENANT_SQL:"1",PRONTO_PREFLIGHT_IGNORE_DOTENV:"1",
    PRONTO_SECRETS_KEY:"local-test-secrets-key-with-more-than-32-characters", AUTH_SECRET:"local-test-auth-secret-with-more-than-32-characters",
    APP_BASE_URL:"http://localhost:3000",PRONTO_AGENT_TURN_TIMEOUT_MS:"45000",PRONTO_AGENT_TURN_MAX_CALLS:"3",PRONTO_AGENT_TURN_MAX_TOKENS:"12000",
    PRONTO_AGENT_MAX_PROMPT_TOKENS:"6000",PRONTO_AGENT_MAX_OUTPUT_TOKENS:"800"},
});
const corpus = JSON.parse(await readFile("evals/agent-answer-quality.json","utf8"));
const revision = spawnSync("git",["rev-parse","HEAD"],{encoding:"utf8"}).stdout?.trim() || process.env.GITHUB_SHA || "unknown";
const corpusHash = createHash("sha256").update(await readFile("evals/agent-answer-quality.json")).digest("hex");
const promptHash = createHash("sha256").update(await readFile("src/lib/llm/prompt.ts")).digest("hex");
await writeFile(resolve(reportDir,"manifest.json"),JSON.stringify({startedAt,finishedAt:new Date().toISOString(),revision,
  corpusHash,promptHash,corpusVersion:corpus.version,cases:corpus.cases.length,mode:corpus.mode,provider:"groq",model:"openai/gpt-oss-20b",
  liveInference:false,report,exitCode:result.status??1},null,2)+"\n");
if(result.error) console.error(result.error.message);
process.exitCode=result.status??1;
