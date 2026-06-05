import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { AppShell } from "@/components/shell";
import { OperatorNav } from "@/components/operator/operator-nav";

export const dynamic = "force-dynamic";

const prontoBoardUrl = "https://keibtang.atlassian.net/jira/software/projects/PRONTO/boards/2";

const monthlyMonitors = [
  {
    label: "OpenAI pricing",
    href: "https://openai.com/api/pricing/",
    owner: "Gabriel",
  },
  {
    label: "Anthropic pricing",
    href: "https://docs.anthropic.com/en/docs/about-claude/pricing",
    owner: "Gabriel",
  },
  {
    label: "Gemini pricing",
    href: "https://ai.google.dev/gemini-api/docs/pricing",
    owner: "Gabriel",
  },
  {
    label: "WhatsApp pricing and policy",
    href: "https://whatsappbusiness.com/products/platform-pricing/",
    owner: "Keith",
  },
];

export default async function OperatorSettingsPage() {
  const user = await requireUser("operator");

  return (
    <AppShell user={user} active="operator">
      <div className="mb-5">
        <h1 className="text-xl font-semibold tracking-[-0.01em]">Operator settings</h1>
        <p className="text-sm text-muted">
          Internal references for setup, credential handling, and launch operations.
        </p>
      </div>
      <OperatorNav active="settings" />

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="ui-panel">
          <div className="ui-panel-header">
            <h2 className="text-base font-semibold">Jira references</h2>
          </div>
          <div className="space-y-3 p-4 text-sm">
            <p className="text-muted">
              Use the Pronto board as the source of truth for implementation TODOs, ideas, launch blockers, and credential storage references.
            </p>
            <Link
              href={prontoBoardUrl}
              className="ui-button px-3 py-2 text-accent"
            >
              Open PRONTO board
            </Link>
          </div>
        </div>

        <div className="ui-panel">
          <div className="ui-panel-header">
            <h2 className="text-base font-semibold">Credential checklist</h2>
          </div>
          <div className="space-y-3 p-4 text-sm text-muted">
            <p>Store production credentials in the approved private Jira credential references, not in comments, screenshots, or source code.</p>
            <p>Keep local `.env` values scoped to development, and rotate any credential that was exposed during tunnel/webhook testing.</p>
            <p>Use each client&apos;s Channels tab for webhook URLs, channel health checks, and per-channel credential shape validation.</p>
          </div>
        </div>
      </section>

      <section className="mt-6 ui-panel">
        <div className="ui-panel-header">
          <h2 className="text-base font-semibold">Monthly production monitors</h2>
          <p className="text-sm text-muted">
            Manual cadence until these checks are backed by persistent scheduled jobs.
          </p>
        </div>
        <div className="divide-y divide-line">
          {monthlyMonitors.map((monitor) => (
            <a
              key={monitor.label}
              href={monitor.href}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-between gap-4 p-4 hover:bg-surface-hover"
            >
              <div>
                <p className="font-medium">{monitor.label}</p>
                <p className="text-sm text-muted">
                  Owner: {monitor.owner} · record review notes on the PRONTO Jira board
                </p>
              </div>
              <span className="text-sm font-medium text-accent">Open</span>
            </a>
          ))}
        </div>
      </section>
    </AppShell>
  );
}
