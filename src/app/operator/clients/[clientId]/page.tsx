import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import {
  getChannels,
  getClient,
  getConversationMessages,
  getKnowledgeSources,
  getMetrics,
  getOpenEscalations,
  getRecentConversations,
} from "@/lib/dashboard";
import { AppShell } from "@/components/shell";
import { Badge } from "@/components/badge";
import { PilotConsole } from "@/components/pilot-console";
import { StatCard } from "@/components/stat-card";

export const dynamic = "force-dynamic";

export default async function ClientOperatorPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const user = await requireUser("operator");
  const { clientId } = await params;
  const client = await getClient(clientId);
  if (!client) {
    notFound();
  }

  const [metrics, channels, knowledge, escalations, conversations] = await Promise.all([
    getMetrics(client.id),
    getChannels(client.id),
    getKnowledgeSources(client.id),
    getOpenEscalations(client.id),
    getRecentConversations(client.id, 6),
  ]);
  const firstConversation = conversations[0];
  const firstMessages = firstConversation
    ? await getConversationMessages(firstConversation.id)
    : [];

  return (
    <AppShell user={user} active="operator">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <a href="/operator" className="text-sm text-accent">
            Back to operator dashboard
          </a>
          <h1 className="mt-2 text-2xl font-semibold">{client.name}</h1>
          <p className="text-sm text-muted">{client.brand_voice}</p>
        </div>
        <Badge tone="amber">{client.status}</Badge>
      </div>

      <section className="grid gap-4 md:grid-cols-4">
        <StatCard label="Conversations" value={metrics.conversations} />
        <StatCard label="Escalation rate" value={`${Math.round(metrics.escalationRate * 100)}%`} />
        <StatCard label="Open escalations" value={metrics.openEscalations} />
        <StatCard label="Hallucinations" value={metrics.hallucinationIncidents} />
      </section>

      <section className="mt-6 grid gap-6 lg:grid-cols-[1fr_0.9fr]">
        <PilotConsole clientId={client.id} />

        <div className="rounded-lg border border-line bg-panel">
          <div className="border-b border-line p-4">
            <h2 className="text-base font-semibold">Knowledge ingestion</h2>
          </div>
          <form action="/api/operator/knowledge" method="post" className="space-y-3 p-4">
            <input type="hidden" name="clientId" value={client.id} />
            <input
              name="title"
              required
              className="w-full rounded-md border border-line px-3 py-2 text-sm"
              placeholder="Source title"
            />
            <textarea
              name="content"
              required
              rows={7}
              className="w-full rounded-md border border-line px-3 py-2 text-sm"
              placeholder="Paste FAQ, menu, policy, or brand content"
            />
            <button className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white">
              Ingest source
            </button>
          </form>
        </div>
      </section>

      <section className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-line bg-panel">
          <div className="border-b border-line p-4">
            <h2 className="text-base font-semibold">Channel setup</h2>
          </div>
          <div className="divide-y divide-line">
            {channels.map((channel) => (
              <form key={channel.id} action="/api/operator/channels" method="post" className="space-y-3 p-4">
                <input type="hidden" name="clientId" value={client.id} />
                <input type="hidden" name="channelId" value={channel.id} />
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">{channel.name}</p>
                    <p className="text-sm text-muted">{channel.kind}</p>
                  </div>
                  <Badge tone={channel.status === "active" ? "green" : "amber"}>{channel.status}</Badge>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <select name="status" defaultValue={channel.status} className="rounded-md border border-line px-3 py-2 text-sm">
                    <option value="draft">draft</option>
                    <option value="active">active</option>
                    <option value="disabled">disabled</option>
                  </select>
                  <input
                    name="externalId"
                    defaultValue={channel.external_id ?? ""}
                    className="rounded-md border border-line px-3 py-2 text-sm"
                    placeholder="Phone number ID / bot ID"
                  />
                </div>
                <textarea
                  name="settings"
                  rows={3}
                  defaultValue={JSON.stringify(channel.settings, null, 2)}
                  className="w-full rounded-md border border-line px-3 py-2 font-mono text-xs"
                />
                <textarea
                  name="credentials"
                  rows={3}
                  defaultValue={JSON.stringify(channel.credentials, null, 2)}
                  className="w-full rounded-md border border-line px-3 py-2 font-mono text-xs"
                />
                <button className="rounded-md border border-line bg-white px-3 py-2 text-sm font-medium">
                  Save channel
                </button>
              </form>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-line bg-panel">
          <div className="border-b border-line p-4">
            <h2 className="text-base font-semibold">Knowledge sources</h2>
          </div>
          <div className="divide-y divide-line">
            {knowledge.map((source) => (
              <div key={source.id} className="p-4">
                <p className="font-medium">{source.title}</p>
                <p className="text-sm text-muted">
                  {source.source_type} · {source.chunk_count} chunks
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mt-6 grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
        <div className="rounded-lg border border-line bg-panel">
          <div className="border-b border-line p-4">
            <h2 className="text-base font-semibold">Escalations</h2>
          </div>
          <div className="divide-y divide-line">
            {escalations.length === 0 ? (
              <p className="p-4 text-sm text-muted">No open escalations.</p>
            ) : (
              escalations.map((escalation) => (
                <div key={escalation.id} className="p-4">
                  <Badge tone="red">{escalation.reason_code}</Badge>
                  <p className="mt-2 text-sm text-muted">{escalation.reason_detail}</p>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-lg border border-line bg-panel">
          <div className="border-b border-line p-4">
            <h2 className="text-base font-semibold">Conversation review</h2>
          </div>
          {firstConversation ? (
            <div id={`conversation-${firstConversation.id}`} className="p-4">
              <div className="space-y-3">
                {firstMessages.map((message) => (
                  <div key={message.id} className="rounded-md bg-stone-50 p-3 text-sm">
                    <p className="mb-1 font-medium">{message.sender_role}</p>
                    <p className="text-muted">{message.body}</p>
                  </div>
                ))}
              </div>
              <form action="/api/operator/reviews" method="post" className="mt-4 grid gap-3 sm:grid-cols-2">
                <input type="hidden" name="clientId" value={client.id} />
                <input type="hidden" name="conversationId" value={firstConversation.id} />
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="hallucination" />
                  Hallucination incident
                </label>
                <select name="escalationWasNeeded" className="rounded-md border border-line px-3 py-2 text-sm">
                  <option value="">Escalation accuracy</option>
                  <option value="true">Escalation was needed</option>
                  <option value="false">Escalation was not needed</option>
                </select>
                <input name="csat" type="number" min="1" max="5" className="rounded-md border border-line px-3 py-2 text-sm" placeholder="CSAT 1-5" />
                <input name="notes" className="rounded-md border border-line px-3 py-2 text-sm" placeholder="Review notes" />
                <button className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white sm:col-span-2">
                  Save review
                </button>
              </form>
            </div>
          ) : (
            <p className="p-4 text-sm text-muted">No conversations yet.</p>
          )}
        </div>
      </section>
    </AppShell>
  );
}

