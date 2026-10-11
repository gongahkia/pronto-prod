export const DEFAULT_DATABASE_URL =
  "postgres://pronto:pronto@localhost:55432/pronto";

export function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function databaseUrl(): string {
  return process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL;
}

export function appBaseUrl(): string {
  return process.env.APP_BASE_URL ?? "http://localhost:3000";
}

export function whatsAppGraphVersion(): string {
  return process.env.WHATSAPP_GRAPH_VERSION ?? "v25.0";
}

export function metaGraphVersion(): string {
  return process.env.META_GRAPH_VERSION ?? "v25.0";
}

// Meta retired v20.0 on 24 September 2026. Revisit this floor as later
// versions expire; sandbox compatibility still needs separate verification.
export function isSupportedMetaGraphVersion(version: string): boolean {
  const match = /^v(\d+)\.\d+$/.exec(version);
  return Boolean(match && Number(match[1]) >= 21);
}

export function shouldUseMockAi(): boolean {
  return process.env.PRONTO_USE_MOCK_AI === "1";
}
