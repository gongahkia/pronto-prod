import { existsSync, readFileSync } from "node:fs";
import { getPool } from "../src/lib/db";
import { appBaseUrl, databaseUrl, shouldUseMockAi } from "../src/lib/env";
import { envApiKeyForProvider } from "../src/lib/llm/credentials";
import { decryptChannelCredentials } from "../src/lib/channels/credentials";
import { validateChannelHealthConfig } from "../src/lib/channels/health";
import type { Channel } from "../src/lib/types";

type CheckStatus = "pass" | "warn" | "fail";

type Check = {
  name: string;
  status: CheckStatus;
  detail: string;
};

type ChannelRow = Channel & {
  client_name: string;
};

loadDotEnv(".env");
loadDotEnv(".env.local");

const checks: Check[] = [];
const profile = process.env.PRONTO_PREFLIGHT_PROFILE === "ci" ? "ci" : "staging";

async function main() {
  checkCoreEnv();

  const pool = getPool();
  let dbAvailable = false;

  try {
    await pool.query("select 1");
    dbAvailable = true;
    checks.push({
      name: "Database",
      status: "pass",
      detail: "DATABASE_URL is reachable.",
    });
  } catch (error) {
    checks.push({
      name: "Database",
      status: "fail",
      detail: `DATABASE_URL is not reachable: ${errorMessage(error)}`,
    });
  }

  if (dbAvailable) {
    await checkProviderCredentials();
    await checkSeededClientAndChannels();
  } else {
    checks.push({
      name: "Provider credentials",
      status: "warn",
      detail: "Skipped DB-backed credential lookup because the database is unavailable.",
    });
    checks.push({
      name: "Channels",
      status: "warn",
      detail: "Skipped channel readiness because the database is unavailable.",
    });
  }

  printChecks(checks);
  await pool.end();

  if (checks.some((check) => check.status === "fail")) {
    process.exit(1);
  }
}

function checkCoreEnv() {
  checks.push({
    name: "PRONTO_USE_MOCK_AI",
    status: shouldUseMockAi() ? (profile === "ci" ? "warn" : "fail") : "pass",
    detail: shouldUseMockAi()
      ? profile === "ci"
        ? "CI may use deterministic mock AI; staging must set PRONTO_USE_MOCK_AI=0."
        : "Set PRONTO_USE_MOCK_AI=0 for live provider staging."
      : "Live provider mode is enabled.",
  });

  const authSecret = process.env.AUTH_SECRET ?? "";
  checks.push({
    name: "AUTH_SECRET",
    status: isStrongSecret(authSecret) ? "pass" : "fail",
    detail: isStrongSecret(authSecret)
      ? "Non-placeholder auth secret is configured."
      : "Set AUTH_SECRET to a non-placeholder value with at least 32 characters.",
  });

  const secretsKey = process.env.PRONTO_SECRETS_KEY ?? "";
  checks.push({
    name: "PRONTO_SECRETS_KEY",
    status: isStrongSecret(secretsKey) ? "pass" : "fail",
    detail: isStrongSecret(secretsKey)
      ? "Encrypted channel credential storage is available."
      : "Set PRONTO_SECRETS_KEY to a non-placeholder value with at least 32 characters.",
  });

  const baseUrl = appBaseUrl();
  checks.push({
    name: "APP_BASE_URL",
    status: baseUrl.startsWith("https://") || profile === "ci" ? "pass" : "fail",
    detail: baseUrl.startsWith("https://")
      ? "Public HTTPS base URL is configured."
      : profile === "ci"
        ? "CI profile allows a local HTTP base URL."
        : "Set APP_BASE_URL to the public HTTPS tunnel URL before live webhook testing.",
  });

  checks.push({
    name: "DATABASE_URL",
    status: databaseUrl() ? "pass" : "fail",
    detail: "Database URL is configured.",
  });

  checks.push({
    name: "PRONTO_ENFORCE_TENANT_SQL",
    status: process.env.PRONTO_ENFORCE_TENANT_SQL === "1" ? "pass" : "warn",
    detail:
      process.env.PRONTO_ENFORCE_TENANT_SQL === "1"
        ? "Client-session tenant SQL gate is enabled."
        : "Set PRONTO_ENFORCE_TENANT_SQL=1 in staging to catch unscoped client queries.",
  });
}

async function checkProviderCredentials() {
  const provider = process.env.PRONTO_LLM_PROVIDER ?? "openai";
  const generationKey = envApiKeyForProvider(provider);
  const supportedProvider =
    provider === "openai" || provider === "azure" || provider === "anthropic";
  checks.push({
    name: `Generation provider (${provider})`,
    status: generationKey && supportedProvider
      ? "pass"
      : profile === "ci"
        ? "warn"
        : "fail",
    detail: providerCredentialDetail(provider, generationKey, supportedProvider),
  });

  const openAiKey = envApiKeyForProvider("openai");
  const azureEmbeddingReady =
    Boolean(envApiKeyForProvider("azure")) &&
    Boolean(process.env.AZURE_OPENAI_EMBEDDING_DEPLOYMENT?.trim());
  checks.push({
    name: "Embeddings",
    status: openAiKey || azureEmbeddingReady ? "pass" : profile === "ci" ? "warn" : "fail",
    detail: openAiKey
      ? "OpenAI credential is available for embeddings and default generation."
      : azureEmbeddingReady
        ? "Azure OpenAI credential and embedding deployment are available."
        : "Set OPENAI_API_KEY, or set AZURE_OPENAI_API_KEY plus AZURE_OPENAI_EMBEDDING_DEPLOYMENT.",
  });
}

function providerCredentialDetail(provider: string, key: string | null, supportedProvider: boolean): string {
  if (!supportedProvider) {
    return "Set PRONTO_LLM_PROVIDER to openai, azure, or anthropic.";
  }
  if (!key) {
    if (provider === "anthropic") return "Set ANTHROPIC_API_KEY.";
    if (provider === "azure") return "Set AZURE_OPENAI_API_KEY.";
    return "Set OPENAI_API_KEY.";
  }
  return "Generation provider environment credential is available.";
}

async function checkSeededClientAndChannels() {
  const pool = getPool();
  const clients = await pool.query<{ id: string; name: string; slug: string }>(
    "select id, name, slug from clients order by created_at asc limit 5",
  );
  checks.push({
    name: "Clients",
    status: clients.rows.length ? "pass" : "fail",
    detail: clients.rows.length
      ? `${clients.rows.length} client record(s) found.`
      : "No clients found. Run pnpm seed or create a pilot client.",
  });

  const channels = await pool.query<ChannelRow>(
    `
      select ch.*, cl.name as client_name
      from channels ch
      join clients cl on cl.id = ch.client_id
      order by cl.created_at asc, ch.kind asc
    `,
  );

  const liveChannels = channels.rows.filter((channel) => channel.status === "active");
  checks.push({
    name: "Live channels",
    status: liveChannels.length ? "pass" : profile === "ci" ? "warn" : "fail",
    detail: liveChannels.length
      ? `${liveChannels.length} active channel record(s) found.`
      : profile === "ci"
        ? "CI seed may not activate live channels."
        : "No active channel records found.",
  });

  for (const channel of liveChannels) {
    if (hasPlaintextCredentials(channel)) {
      checks.push({
        name: `${channel.client_name} ${channel.kind} credential storage`,
        status: "fail",
        detail:
          "Active channel still has plaintext credentials. Run pnpm channels:encrypt-credentials before deployment.",
      });
      continue;
    }
    const configIssue = validateChannelHealthConfig(decryptChannelCredentials(channel));
    checks.push({
      name: `${channel.client_name} ${channel.kind} channel`,
      status: configIssue ? "fail" : "pass",
      detail: configIssue ?? "Required channel credentials/settings are present.",
    });
  }
}

function hasPlaintextCredentials(channel: ChannelRow): boolean {
  return (
    Object.keys(channel.credentials ?? {}).length > 0 &&
    !channel.encrypted_credentials
  );
}

function isStrongSecret(value: string): boolean {
  const trimmed = value.trim();
  const lowered = trimmed.toLowerCase();
  return (
    trimmed.length >= 32 &&
    new Set(trimmed).size >= 12 &&
    !lowered.startsWith("replace-with") &&
    !lowered.includes("change-me") &&
    !lowered.includes("placeholder")
  );
}

function printChecks(items: Check[]) {
  const rank: Record<CheckStatus, number> = { fail: 0, warn: 1, pass: 2 };
  for (const check of [...items].sort((left, right) => rank[left.status] - rank[right.status])) {
    console.log(`${check.status.toUpperCase()} ${check.name}: ${check.detail}`);
  }

  const failed = items.filter((check) => check.status === "fail").length;
  const warned = items.filter((check) => check.status === "warn").length;
  const passed = items.filter((check) => check.status === "pass").length;
  console.log(`\nPreflight summary: ${passed} passed, ${warned} warnings, ${failed} failed.`);
}

function errorMessage(error: unknown): string {
  if (
    error &&
    typeof error === "object" &&
    "errors" in error &&
    Array.isArray((error as { errors?: unknown[] }).errors)
  ) {
    const messages = (error as { errors: unknown[] }).errors
      .map((entry) => errorMessage(entry))
      .filter(Boolean);
    return messages.join("; ");
  }
  return error instanceof Error ? error.message : String(error);
}

function loadDotEnv(filename: string) {
  if (!existsSync(filename)) {
    return;
  }

  const content = readFileSync(filename, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex <= 0) {
      continue;
    }

    const key = trimmed.slice(0, equalsIndex).trim();
    const rawValue = trimmed.slice(equalsIndex + 1).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      continue;
    }

    process.env[key] = unquote(rawValue);
  }
}

function unquote(value: string): string {
  if (
    (value.startsWith("\"") && value.endsWith("\"")) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

main().catch(async (error) => {
  console.error(error);
  await getPool().end();
  process.exit(1);
});
