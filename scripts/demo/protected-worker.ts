import { assertCustomerDemoEnabled } from "../../src/lib/customer-demo-boundary";
import { protectedDemoConfiguration } from "../../src/lib/deployment-profile";

protectedDemoConfiguration();
await assertCustomerDemoEnabled();
await import("../worker");
