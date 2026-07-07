import { ArrowRight, MessageSquareText } from "lucide-react";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { formatDate } from "@/lib/date-format";
import {
  getOperatorCommandCenter,
  type OperatorClientHealth,
} from "@/lib/reporting";
import { AppShell } from "@/components/shell";
import { Badge } from "@/components/badge";

export default async function OperatorConversationsPage() {
  const user = await requireUser("operator");
  const commandCenter = await getOperatorCommandCenter();

  return (
    <AppShell user={user} active="operator" operatorActive="conversations">
      <div className="mb-5">
        <h1 className="text-xl font-semibold">Conversations</h1>
        <p className="text-sm text-muted">
          Select a client before opening their conversation inbox.
        </p>
      </div>

      <section className="ui-panel">
        <div className="ui-panel-header">
          <div className="flex items-center gap-2">
            <MessageSquareText size={17} className="text-accent" />
            <h2 className="text-base font-semibold">Client inboxes</h2>
          </div>
        </div>
        <div className="divide-y divide-line">
          {commandCenter.clientHealth.length === 0 ? (
            <p className="p-4 text-sm text-muted">No clients have been created.</p>
          ) : (
            commandCenter.clientHealth.map((client) => (
              <ClientConversationRow key={client.clientId} client={client} />
            ))
          )}
        </div>
      </section>
    </AppShell>
  );
}

function ClientConversationRow({ client }: { client: OperatorClientHealth }) {
  return (
    <Link
      href={`/operator/clients/${client.clientId}/conversations`}
      className="flex flex-col gap-4 p-4 hover:bg-surface-hover sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-medium">{client.name}</p>
          <Badge tone={client.openTriage ? "amber" : "green"}>
            {client.openTriage} open triage
          </Badge>
          <Badge>{client.activeChannels} active channels</Badge>
        </div>
        <p className="mt-1 text-sm text-muted">
          Latest activity {formatWhen(client.latestActivityAt)}
        </p>
      </div>
      <span className="inline-flex shrink-0 items-center gap-2 text-sm font-medium text-accent">
        Open inbox
        <ArrowRight size={16} />
      </span>
    </Link>
  );
}

function formatWhen(value: Date | null): string {
  if (!value) {
    return "not seen yet";
  }
  return formatDate(value);
}
