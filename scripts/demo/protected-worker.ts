import { assertCustomerDemoEnabled } from "../../src/lib/customer-demo-boundary";
import { protectedDemoConfiguration,requestDrivenDemoProcessing } from "../../src/lib/deployment-profile";

protectedDemoConfiguration();
if(requestDrivenDemoProcessing())throw new Error('Request-driven demo processing must not also run a persistent worker.');
await assertCustomerDemoEnabled();
await import("../worker");
