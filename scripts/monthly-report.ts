import { getPool } from "../src/lib/db";
import {
  defaultMonthlyWindow,
  formatMonthlyCheckInReport,
  generateMonthlyCheckInReport,
} from "../src/lib/monthly-report";

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const clientId = args.client;
  if (!clientId) {
    console.error("Usage: pnpm tsx scripts/monthly-report.ts --client <clientId> [--as-of YYYY-MM-DD]");
    process.exit(1);
  }

  const asOf = args.asOf ? new Date(args.asOf) : new Date();
  if (Number.isNaN(asOf.getTime())) {
    console.error(`Invalid --as-of value: ${args.asOf}`);
    process.exit(1);
  }
  const { windowStart, windowEnd } = defaultMonthlyWindow(asOf);

  try {
    const report = await generateMonthlyCheckInReport({
      clientId,
      windowStart,
      windowEnd,
    });
    if (args.json) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      console.log(formatMonthlyCheckInReport(report));
    }
  } finally {
    await getPool().end();
  }
}

function parseArgs(argv: string[]): { client?: string; asOf?: string; json?: boolean } {
  const out: { client?: string; asOf?: string; json?: boolean } = {};
  for (let i = 0; i < argv.length; i++) {
    const value = argv[i];
    if (value === "--client") out.client = argv[++i];
    else if (value === "--as-of") out.asOf = argv[++i];
    else if (value === "--json") out.json = true;
  }
  return out;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
