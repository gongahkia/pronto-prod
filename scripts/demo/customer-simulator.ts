import { verifyTestDatabase } from "../test-db-safety";
import { getPool } from "../../src/lib/db";
import { setupCustomerSimulator, prepareRealDemoEmbeddings } from "../../src/lib/customer-demo-setup";

try {
  await verifyTestDatabase();
  if (process.argv[2] === "setup") { await setupCustomerSimulator(); console.log("Authenticated customer simulator prepared."); }
  else if (process.argv[2] === "embed" && process.env.PRONTO_DEMO_REAL_AI_APPROVED === "1")
    console.log(JSON.stringify(await prepareRealDemoEmbeddings()));
  else throw new Error("Use setup, or explicitly opt in to embed with PRONTO_DEMO_REAL_AI_APPROVED=1. Embedding calls may incur provider charges.");
} catch (error) {
  // Configuration errors name variables, never their values or provider payloads.
  console.error(error instanceof Error && error.name === "DemoError" ? error.message : "Customer demo setup failed. Check local configuration and sanitized server logs.");
  process.exitCode = 1;
} finally { await getPool().end(); }
