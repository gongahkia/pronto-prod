import { verifyTestDatabase } from "../test-db-safety";
import { assertCustomerDemoEnabled } from "../../src/lib/customer-demo-boundary";

await verifyTestDatabase();
await assertCustomerDemoEnabled();
// The existing worker and queue remain shared. Only synthetic/local delivery is
// permitted here, even if a fixture or operator accidentally activates Meta.
process.env.PRONTO_DEMO_ONLY_DELIVERY = "1";
await import("../worker");
