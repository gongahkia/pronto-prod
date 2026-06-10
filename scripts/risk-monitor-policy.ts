import { runRiskMonitor } from "../src/lib/risk-monitor";
import { logError, logInfo } from "../src/lib/logger";

async function main() {
  const result = await runRiskMonitor("policy");
  logInfo("risk_monitor.policy_finished", {
    checked: result.checked,
    changed: result.changed,
    unreachable: result.unreachable,
    overdue: result.overdue,
    findingIds: result.findings.map((f) => f.id),
  });
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  logError("risk_monitor.policy_failed", { error });
  process.exitCode = 1;
});
