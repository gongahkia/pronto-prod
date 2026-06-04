import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { AppShell } from "@/components/shell";
import { OperatorNav } from "@/components/operator/operator-nav";

export const dynamic = "force-dynamic";

const prontoBoardUrl = "https://keibtang.atlassian.net/jira/software/projects/PRONTO/boards/2";

export default async function OperatorSettingsPage() {
  const user = await requireUser("operator");

  return (
    <AppShell user={user} active="operator">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Operator settings</h1>
        <p className="text-sm text-muted">
          Internal references for setup, credential handling, and launch operations.
        </p>
      </div>
      <OperatorNav active="settings" />

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-line bg-panel">
          <div className="border-b border-line p-4">
            <h2 className="text-base font-semibold">Jira references</h2>
          </div>
          <div className="space-y-3 p-4 text-sm">
            <p className="text-muted">
              Use the Pronto board as the source of truth for implementation TODOs, ideas, launch blockers, and credential storage references.
            </p>
            <Link
              href={prontoBoardUrl}
              className="inline-flex rounded-md border border-line bg-white px-3 py-2 font-medium text-accent"
            >
              Open PRONTO board
            </Link>
          </div>
        </div>

        <div className="rounded-lg border border-line bg-panel">
          <div className="border-b border-line p-4">
            <h2 className="text-base font-semibold">Credential checklist</h2>
          </div>
          <div className="space-y-3 p-4 text-sm text-muted">
            <p>Store production credentials in the approved private Jira credential references, not in comments, screenshots, or source code.</p>
            <p>Keep local `.env` values scoped to development, and rotate any credential that was exposed during tunnel/webhook testing.</p>
            <p>Use each client&apos;s Channels tab for webhook URLs, channel health checks, and per-channel credential shape validation.</p>
          </div>
        </div>
      </section>
    </AppShell>
  );
}
