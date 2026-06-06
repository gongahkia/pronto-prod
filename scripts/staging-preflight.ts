import { existsSync, readFileSync } from "node:fs";
import { getPool } from "../src/lib/db";
import { appBaseUrl, databaseUrl, shouldUseMockAi } from "../src/lib/env";
import {
  credentialEncryptionConfigured,
  envApiKeyForProvider,
  resolveProviderApiKey,
} from "../src/lib/llm/credentials";
import { azureOpenAiBaseUrl } from "../src/lib/llm/azure";
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
    status: shouldUseMockAi() ? "fail" : "pass",
    detail: shouldUseMockAi()
      ? "Set PRONTO_USE_MOCK_AI=0 for live provider staging."
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
      ? "Encrypted provider credential storage is available."
      : "Set PRONTO_SECRETS_KEY to a non-placeholder value with at least 32 characters.",
  });

  const baseUrl = appBaseUrl();
  checks.push({
    name: "APP_BASE_URL",
    status: baseUrl.startsWith("https://") ? "pass" : "fail",
    detail: baseUrl.startsWith("https://")
      ? "Public HTTPS base URL is configured."
      : "Set APP_BASE_URL to the public HTTPS tunnel URL before live webhook testing.",
  });

  checks.push({
    name: "DATABASE_URL",
    status: databaseUrl() ? "pass" : "fail",
    detail: "Database URL is configured.",
  });
}

async function checkProviderCredentials() {
  const provider = process.env.PRONTO_LLM_PROVIDER ?? "openai";
  const generationKey = await resolveKey(provider);
  checks.push({
    name: `Generation provider (${provider})`,
    status: generationKey && providerRuntimeConfigured(provider) ? "pass" : "fail",
    detail: providerCredentialDetail(provider, generationKey),
  });

  const openAiKey = await resolveKey("openai");
  checks.push({
    name: "OpenAI embeddings",
    status: openAiKey ? "pass" : "fail",
    detail: openAiKey
      ? "OpenAI credential is available for embeddings and default generation."
      : "Set OPENAI_API_KEY or save an encrypted OpenAI credential.",
  });

  checks.push({
    name: "Credential encryption",
    status: credentialEncryptionConfigured() ? "pass" : "fail",
    detail: credentialEncryptionConfigured()
      ? "PRONTO_SECRETS_KEY is present for saved provider credentials."
      : "PRONTO_SECRETS_KEY is required before using DB-backed provider credentials.",
  });
}

function providerRuntimeConfigured(provider: string): boolean {
  return provider !== "azure" || Boolean(azureOpenAiBaseUrl());
}

function providerCredentialDetail(provider: string, key: string | null): string {
  if (!key) {
    return `Set an environment key or saved encrypted credential for ${provider}.`;
  }
  if (!providerRuntimeConfigured(provider)) {
    return "Credential is available, but AZURE_OPENAI_BASE_URL or AZURE_OPENAI_ENDPOINT is missing.";
  }
  return "Generation provider credential is available.";
}

async function resolveKey(provider: string): Promise<string | null> {
  const envValue = envApiKeyForProvider(provider);
  if (envValue) {
    return envValue;
  }
  try {
    return await resolveProviderApiKey(provider);
  } catch (error) {
    checks.push({
      name: `Saved credential lookup (${provider})`,
      status: "warn",
      detail: errorMessage(error),
    });
    return null;
  }
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

  const liveChannels = channels.rows.filter(
    (channel) => channel.kind === "telegram" || channel.kind === "whatsapp",
  );
  checks.push({
    name: "Live channels",
    status: liveChannels.length ? "pass" : "fail",
    detail: liveChannels.length
      ? `${liveChannels.length} Telegram/WhatsApp channel record(s) found.`
      : "No Telegram or WhatsApp channel records found.",
  });

  for (const channel of liveChannels) {
    const configIssue = validateChannelHealthConfig(channel);
    checks.push({
      name: `${channel.client_name} ${channel.kind} channel`,
      status: configIssue ? "fail" : "pass",
      detail: configIssue ?? "Required channel credentials/settings are present.",
    });
  }
}

function isStrongSecret(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.length >= 32 && !trimmed.startsWith("replace-with");
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
