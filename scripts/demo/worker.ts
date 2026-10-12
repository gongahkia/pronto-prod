import { verifyTestDatabase } from "../test-db-safety";

await verifyTestDatabase();
if (process.env.PRONTO_LOCAL_EMAIL_ENABLED !== "1") {
  throw new Error("Demo worker requires PRONTO_LOCAL_EMAIL_ENABLED=1.");
}
process.env.PRONTO_USE_MOCK_AI = "1";
await import("../worker");
