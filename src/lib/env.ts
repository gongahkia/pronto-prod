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

export function shouldUseMockAi(): boolean {
  return process.env.PRONTO_USE_MOCK_AI === "1" || !process.env.OPENAI_API_KEY;
}
