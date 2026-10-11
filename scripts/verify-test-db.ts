import { verifyTestDatabase } from "./test-db-safety";

verifyTestDatabase()
  .then(() => console.log("Isolated test database verified."))
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
