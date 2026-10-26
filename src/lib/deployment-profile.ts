export function protectedDemoDeployment(): boolean {
  return process.env.PRONTO_DEPLOYMENT_PROFILE === "protected-demo";
}

export function requestDrivenDemoProcessing(): boolean {
  return protectedDemoDeployment() && process.env.PRONTO_DEMO_PROCESSING_MODE === "request";
}
export function protectedDemoConfiguration() {
  const fail = () => { throw new Error("Protected demo configuration is incomplete or unsafe. Check its server-only deployment settings."); };
  if (!protectedDemoDeployment() || process.env.NODE_ENV !== "production" ||
      process.env.PRONTO_CUSTOMER_DEMO_ENABLED !== "1" || process.env.PRONTO_DEMO_ONLY_DELIVERY !== "1" ||
      process.env.PRONTO_CHOPE_LIVE_READS !== "0" || process.env.CHOPE_LIVE_READ_APPROVED !== "0" ||
      process.env.PRONTO_DISABLE_TENANT_SQL_GATE === "1" || process.env.PRONTO_TEST_DATABASE_URL) fail();
  if (process.env.PRONTO_DEMO_PROCESSING_MODE && !["worker","request"].includes(process.env.PRONTO_DEMO_PROCESSING_MODE)) fail();
  for (const name of ["AUTH_SECRET", "PRONTO_SECRETS_KEY"]) {
    const secret = process.env[name]?.trim() ?? "";
    if (secret.length < 32 || new Set(secret).size < 12 || /placeholder|change-me|replace-with/i.test(secret)) fail();
  }
  const id = process.env.PRONTO_DEMO_DATABASE_ID ?? "";
  const users = (process.env.PRONTO_DEMO_ALLOWED_USER_IDS ?? "").split(",").map(value => value.trim());
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuid.test(id) || !users.length || users.some(user => !uuid.test(user)) || users.length > 20) fail();
  let database: URL, origin: URL;
  try { database = new URL(process.env.DATABASE_URL ?? ""); origin = new URL(process.env.APP_BASE_URL ?? ""); }
  catch { return fail(); }
  if (!["postgres:","postgresql:"].includes(database.protocol) || database.pathname === "/pronto_test" ||
      !database.hostname || !database.username || !database.pathname.slice(1) ||
      ["disable","no-verify","allow","prefer"].includes(database.searchParams.get("sslmode") ?? "") ||
      origin.protocol !== "https:" || origin.username || origin.password || origin.search || origin.hash || origin.pathname !== "/") fail();
  return { databaseId: id, marker: `pronto:protected-demo:v1:${id}`, allowedUserIds: users, database, origin };
}
