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
import { appBaseUrl } from "@/lib/env";
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
          <form action="/api/operator/knowledge" method="post" encType="multipart/form-data" className="space-y-3 p-4">
            <input type="hidden" name="clientId" value={client.id} />
            <input
              name="title"
              className="w-full rounded-md border border-line px-3 py-2 text-sm"
              placeholder="Source title, optional for uploads"
            />
            <textarea
              name="content"
              rows={7}
              className="w-full rounded-md border border-line px-3 py-2 text-sm"
              placeholder="Paste FAQ, menu, policy, or brand content"
            />
            <input
              name="file"
              type="file"
              accept=".pdf,.docx,.txt,.md,.markdown,.csv,text/plain,text/markdown,text/csv,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              className="w-full rounded-md border border-line px-3 py-2 text-sm"
            />
            <p className="text-xs text-muted">
              Supports PDF, DOCX, TXT, Markdown, and CSV up to 8 MB. Uploaded files are converted into source text before embedding.
            </p>
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
                    <p className="text-sm text-muted">
                      {channel.kind}
                      {channel.last_health_status ? ` · health ${channel.last_health_status}` : ""}
                    </p>
                  </div>
                  <Badge tone={channel.status === "active" ? "green" : "amber"}>{channel.status}</Badge>
                </div>
                {channel.last_health_error ? (
                  <p className="rounded-md bg-red-50 p-2 text-xs text-danger">{channel.last_health_error}</p>
                ) : null}
                {channel.last_outbound_error ? (
                  <p className="rounded-md bg-red-50 p-2 text-xs text-danger">Last send failed: {channel.last_outbound_error}</p>
                ) : null}
                {channel.kind === "whatsapp" || channel.kind === "telegram" ? (
                  <div className="rounded-md bg-stone-50 p-3 text-xs text-muted">
                    <p className="font-medium text-foreground">
                      {channel.kind === "whatsapp" ? "Meta webhook URL" : "Telegram webhook URL"}
                    </p>
                    <p className="mt-1 break-all font-mono">
                      {appBaseUrl()}/api/webhooks/{channel.kind}/{channel.id}
                    </p>
                    <p className="mt-2">
                      {channel.kind === "whatsapp"
                        ? "Use the verify token in settings.verifyToken and the app secret in credentials.appSecret for X-Hub-Signature-256 checks."
                        : "Register this URL with setWebhook and pass settings.webhookSecret as X-Telegram-Bot-Api-Secret-Token."}
                    </p>
                    <p className="mt-1">For local testing, expose port 3000 with an HTTPS tunnel and set APP_BASE_URL to that public URL.</p>
                  </div>
                ) : null}
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
                <button
                  form={`health-${channel.id}`}
                  className="ml-2 rounded-md border border-line bg-white px-3 py-2 text-sm font-medium"
                >
                  Check health
                </button>
              </form>
            ))}
            {channels.map((channel) => (
              <form key={`health-${channel.id}`} id={`health-${channel.id}`} action="/api/operator/channel-health" method="post">
                <input type="hidden" name="clientId" value={client.id} />
                <input type="hidden" name="channelId" value={channel.id} />
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
                      <input type="hidden" name="returnTo" value={`/operator/clients/${client.id}#escalation-${escalation.id}`} />
                      <button className="rounded-md border border-line bg-white px-3 py-2 text-sm font-medium">
                        Claim
                      </button>
                    </form>
                  ) : null}
                  <form action="/api/escalations" method="post" className="space-y-2">
                    <input type="hidden" name="action" value="resolve" />
                    <input type="hidden" name="escalationId" value={escalation.id} />
                    <input type="hidden" name="returnTo" value={`/operator/clients/${client.id}`} />
                    <textarea
                      name="reply"
                      rows={3}
                      className="w-full rounded-md border border-line px-3 py-2 text-sm"
                      placeholder="Owner reply to send back before resolving"
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
                <select name="answerLabel" className="rounded-md border border-line px-3 py-2 text-sm">
                  <option value="">Review label</option>
                  <option value="answered_correctly">Answered correctly</option>
                  <option value="should_have_escalated">Should have escalated</option>
                  <option value="over_escalated">Over-escalated</option>
                  <option value="hallucinated">Hallucinated</option>
                  <option value="needs_knowledge_update">Needs knowledge update</option>
                </select>
                <select name="failureSeverity" className="rounded-md border border-line px-3 py-2 text-sm">
                  <option value="">Severity</option>
                  <option value="p0">P0 launch blocker</option>
                  <option value="p1">P1 high risk</option>
                  <option value="p2">P2 normal fix</option>
                  <option value="p3">P3 polish</option>
                </select>
                <select name="rootCause" className="rounded-md border border-line px-3 py-2 text-sm">
                  <option value="">Root cause</option>
                  <option value="missing_source">Missing source</option>
                  <option value="bad_retrieval">Bad retrieval</option>
                  <option value="guardrail_gap">Guardrail gap</option>
                  <option value="prompt_gap">Prompt gap</option>
                  <option value="integration_gap">Integration gap</option>
                  <option value="channel_issue">Channel issue</option>
                  <option value="human_process">Human process</option>
                </select>
                <select name="fixOwner" className="rounded-md border border-line px-3 py-2 text-sm">
                  <option value="">Fix owner</option>
                  <option value="gabriel">Gabriel</option>
                  <option value="keith">Keith</option>
                  <option value="astin">Astin</option>
                  <option value="client">Client</option>
                </select>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="hallucination" />
                  Hallucination incident
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="knowledgeUpdateNeeded" />
                  Knowledge update needed
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="pilotBlocker" />
                  Pilot blocker
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
