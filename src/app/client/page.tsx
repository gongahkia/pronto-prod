import { requireUser } from "@/lib/auth";
import {
  getClient,
  getKnowledgeSources,
  getMetrics,
  getOpenEscalations,
  getRecentConversations,
} from "@/lib/dashboard";
import { AppShell } from "@/components/shell";
import { Badge } from "@/components/badge";
import { StatCard } from "@/components/stat-card";
import { PilotConsole } from "@/components/pilot-console";

export const dynamic = "force-dynamic";

export default async function ClientPage() {
  const user = await requireUser("client");
  if (!user.clientId) {
    throw new Error("Client user is missing a client assignment.");
  }

  const [client, metrics, escalations, conversations, knowledge] = await Promise.all([
    getClient(user.clientId),
    getMetrics(user.clientId),
    getOpenEscalations(user.clientId),
    getRecentConversations(user.clientId, 10),
    getKnowledgeSources(user.clientId),
  ]);
  if (!client) {
    throw new Error("Client record not found.");
  }

  return (
    <AppShell user={user} active="client">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">{client.name}</h1>
        <p className="text-sm text-muted">Client dashboard for conversations, escalations, and knowledge base.</p>
      </div>

      <section className="grid gap-4 md:grid-cols-4">
        <StatCard label="Conversations" value={metrics.conversations} />
        <StatCard label="Escalation rate" value={`${Math.round(metrics.escalationRate * 100)}%`} />
        <StatCard label="Open escalations" value={metrics.openEscalations} />
        <StatCard label="CSAT" value="Pending" hint="Client-facing collection hook" />
      </section>

      <section className="mt-6 grid gap-6 lg:grid-cols-[1fr_0.9fr]">
        <PilotConsole clientId={client.id} />
        <div className="rounded-lg border border-line bg-panel">
          <div className="border-b border-line p-4">
            <h2 className="text-base font-semibold">Notification settings</h2>
          </div>
          <form action="/api/client/settings" method="post" className="space-y-3 p-4">
            <input
              name="location"
              defaultValue={String(client.business_profile.location ?? "")}
              className="w-full rounded-md border border-line px-3 py-2 text-sm"
              placeholder="Business location"
            />
            <input
              name="ownerChatId"
              defaultValue={String(client.business_profile.ownerChatId ?? "")}
              className="w-full rounded-md border border-line px-3 py-2 text-sm"
              placeholder="Owner Telegram chat ID"
            />
            <input
              name="ownerPhone"
              className="w-full rounded-md border border-line px-3 py-2 text-sm"
              placeholder="Owner WhatsApp phone number"
            />
            <button className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white">
              Save settings
            </button>
          </form>
        </div>
      </section>

      <section className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="rounded-lg border border-line bg-panel lg:col-span-2">
          <div className="border-b border-line p-4">
            <h2 className="text-base font-semibold">Conversations</h2>
          </div>
          <div className="divide-y divide-line">
            {conversations.map((conversation) => (
              <div key={conversation.id} className="p-4">
                <div className="flex items-center gap-2">
                  <p className="font-medium">{conversation.customer_name ?? conversation.customer_handle}</p>
                  <Badge tone={conversation.status === "escalated" ? "red" : "green"}>{conversation.status}</Badge>
                </div>
                <p className="mt-1 text-sm text-muted">{conversation.last_message}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-lg border border-line bg-panel">
            <div className="border-b border-line p-4">
              <h2 className="text-base font-semibold">Active escalations</h2>
            </div>
            <div className="divide-y divide-line">
              {escalations.length === 0 ? (
                <p className="p-4 text-sm text-muted">No active escalations.</p>
              ) : (
                escalations.map((escalation) => (
                  <div key={escalation.id} id={`escalation-${escalation.id}`} className="space-y-3 p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={escalation.status === "claimed" ? "amber" : "red"}>
                        {escalation.status}
                      </Badge>
                      <Badge tone="red">{escalation.reason_code}</Badge>
                    </div>
                    <div>
                      <p className="text-sm font-medium">Customer question</p>
                      <p className="mt-1 text-sm text-muted">{escalation.customer_message}</p>
                    </div>
                    <p className="text-sm text-muted">{escalation.reason_detail}</p>
                    {escalation.status === "open" ? (
                      <form action="/api/escalations" method="post">
                        <input type="hidden" name="action" value="claim" />
                        <input type="hidden" name="escalationId" value={escalation.id} />
                        <input type="hidden" name="returnTo" value={`/client#escalation-${escalation.id}`} />
                        <button className="rounded-md border border-line bg-white px-3 py-2 text-sm font-medium">
                          Claim
                        </button>
                      </form>
                    ) : null}
                    <form action="/api/escalations" method="post" className="space-y-2">
                      <input type="hidden" name="action" value="resolve" />
                      <input type="hidden" name="escalationId" value={escalation.id} />
                      <input type="hidden" name="returnTo" value="/client" />
                      <textarea
                        name="reply"
                        rows={3}
                        className="w-full rounded-md border border-line px-3 py-2 text-sm"
                        placeholder="Reply to customer before resolving"
                      />
                      <button className="rounded-md bg-accent px-3 py-2 text-sm font-semibold text-white">
                        Send reply and resolve
                      </button>
                    </form>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="rounded-lg border border-line bg-panel">
            <div className="border-b border-line p-4">
              <h2 className="text-base font-semibold">Knowledge base</h2>
            </div>
            <div className="divide-y divide-line">
              {knowledge.map((source) => (
                <div key={source.id} className="p-4">
                  <p className="font-medium">{source.title}</p>
                  <p className="text-sm text-muted">{source.chunk_count} chunks</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </AppShell>
  );
}
