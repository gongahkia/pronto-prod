import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getClient, getClientConversationTriage } from "@/lib/dashboard";
import { AppShell } from "@/components/shell";
import { Badge } from "@/components/badge";
import { ClientNav } from "@/components/client-nav";

export const dynamic = "force-dynamic";

export default async function ClientPage() {
  const user = await requireUser("client");
  if (!user.clientId) {
    throw new Error("Client user is missing a client assignment.");
  }

  const [client, conversations] = await Promise.all([
    getClient(user.clientId),
    getClientConversationTriage(user.clientId),
  ]);
  if (!client) {
    throw new Error("Client record not found.");
  }

  return (
    <AppShell user={user} active="client">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">{client.name}</h1>
        <p className="text-sm text-muted">
          Review customer conversations and open triage when Pronto needs help.
        </p>
      </div>
      <ClientNav active="conversations" />

      <section className="rounded-lg border border-line bg-panel">
        <div className="border-b border-line p-4">
          <h2 className="text-base font-semibold">Conversations</h2>
        </div>
        <div className="divide-y divide-line">
          {conversations.length === 0 ? (
            <p className="p-4 text-sm text-muted">No conversations yet.</p>
          ) : (
            conversations.map((conversation) => (
              <div
                key={conversation.id}
                className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">
                      {conversation.customer_name ?? conversation.customer_handle}
                    </p>
                    <Badge tone={conversation.status === "escalated" ? "red" : "green"}>
                      {conversation.status}
                    </Badge>
                    <Badge>{conversation.channel_kind}</Badge>
                    {conversation.active_escalation_reason_code ? (
                      <Badge tone="red">{conversation.active_escalation_reason_code}</Badge>
                    ) : null}
                  </div>
                  <p className="mt-1 text-sm text-muted">{conversation.last_message}</p>
                </div>

                {conversation.active_escalation_id ? (
                  <Link
                    href={`/client/escalations#escalation-${conversation.active_escalation_id}`}
                    className="inline-flex shrink-0 items-center justify-center gap-2 rounded-md bg-accent px-3 py-2 text-sm font-semibold text-white hover:bg-teal-800"
                  >
                    Open triage
                    <ArrowRight size={16} />
                  </Link>
                ) : null}
              </div>
            ))
          )}
        </div>
      </section>
    </AppShell>
  );
}
