import { getPool } from "../src/lib/db";
import { removePsCafeDemo, setupPsCafeDemo } from "./demo/ps-cafe-raffles-city";

async function main() {
  if (process.argv[2] === "setup") await setupPsCafeDemo();
  else if (process.argv[2] === "remove") await removePsCafeDemo();
  else throw new Error("Use setup or remove.");
  console.log(`PS.Cafe demo ${process.argv[2]} completed in the verified test database.`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}).finally(async () => { await getPool().end(); });
