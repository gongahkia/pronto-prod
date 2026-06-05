import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { appBaseUrl } from "@/lib/env";
import {
  getEscalationHoldingReply,
  settingsWithoutEscalationHoldingReply,
} from "@/lib/channels/escalation-handoff";
import type {
  ConversationWithLastMessage,
  EscalationWithContext,
  KnowledgeSourceSummary,
} from "@/lib/dashboard";
import type { Channel, Client, Message } from "@/lib/types";
import { Badge } from "@/components/badge";
import { DeliveryStatusBadge } from "@/components/delivery-status";
import { EscalationOutboundStatus } from "@/components/escalation-outbound-status";

export function OperatorEscalationList({
  escalations,
  emptyText = "No actionable triage.",
  showClient = true,
  returnTo,
}: {
  escalations: EscalationWithContext[];
  emptyText?: string;
  showClient?: boolean;
  returnTo: (escalation: EscalationWithContext) => string;
}) {
  return (
    <div className="divide-y divide-line">
      {escalations.length === 0 ? (
        <p className="p-4 text-sm text-muted">{emptyText}</p>
      ) : (
        escalations.map((escalation) => {
          const returnPath = returnTo(escalation);
          return (
            <div key={escalation.id} id={`escalation-${escalation.id}`} className="space-y-3 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={escalation.status === "claimed" ? "amber" : "red"}>
                  {escalation.status}
                </Badge>
                <Badge tone="red">{escalation.reason_code}</Badge>
                <Badge>{escalation.channel_kind}</Badge>
                <DeliveryStatusBadge
                  label="customer"
                  status={escalation.customer_handoff_status}
                  error={escalation.customer_handoff_error}
                />
                <DeliveryStatusBadge
                  label="owner"
                  status={escalation.owner_notification_status}
                  error={escalation.owner_notification_error}
                />
              </div>
              {showClient ? (
                <Link
                  href={`/operator/clients/${escalation.client_id}/conversations/${escalation.conversation_id}`}
                  className="inline-flex items-center gap-2 text-sm font-medium text-accent"
                >
                  {escalation.client_name}
                  <ArrowRight size={15} />
                </Link>
              ) : null}
              <div>
                <p className="text-sm font-medium">Customer question</p>
                <p className="mt-1 text-sm text-muted">{escalation.customer_message}</p>
              </div>
              <p className="text-sm text-muted">{escalation.reason_detail}</p>
              <EscalationOutboundStatus
                escalationId={escalation.id}
                outboundMessageId={escalation.owner_resolution_outbound_id}
                status={escalation.owner_resolution_outbound_status}
                error={escalation.owner_resolution_outbound_error}
                attemptCount={escalation.owner_resolution_outbound_attempt_count}
                returnTo={returnPath}
              />
              {escalation.status === "open" ? (
                <form action="/api/escalations" method="post">
                  <input type="hidden" name="action" value="claim" />
                  <input type="hidden" name="escalationId" value={escalation.id} />
                  <input type="hidden" name="returnTo" value={returnPath} />
                  <button className="ui-button px-3 py-2">
                    Claim
                  </button>
                </form>
              ) : null}
              {escalation.status !== "resolved" ? (
                <form action="/api/escalations" method="post" className="space-y-2">
                  <input type="hidden" name="action" value="resolve" />
                  <input type="hidden" name="escalationId" value={escalation.id} />
                  <input type="hidden" name="returnTo" value={returnPath} />
                  <textarea
                    name="reply"
                    rows={3}
                    className="w-full rounded-md border border-line px-3 py-2 text-sm"
                    placeholder="Owner reply to send back before resolving"
                  />
                  <button className="ui-primary-button px-3 py-2">
                    Send reply and resolve
                  </button>
                </form>
              ) : null}
            </div>
          );
        })
      )}
    </div>
  );
}

export function OperatorChannelSetup({
  clientId,
  channels,
}: {
  clientId: string;
  channels: Channel[];
}) {
  return (
    <div className="ui-panel">
      <div className="ui-panel-header">
        <h2 className="text-base font-semibold">Channel setup</h2>
      </div>
      <div className="divide-y divide-line">
        {channels.length === 0 ? (
          <p className="p-4 text-sm text-muted">No channels have been created for this client.</p>
        ) : (
          channels.map((channel) => (
            <form key={channel.id} action="/api/operator/channels" method="post" className="space-y-3 p-4">
              <input type="hidden" name="clientId" value={clientId} />
              <input type="hidden" name="channelId" value={channel.id} />
              <input type="hidden" name="returnTo" value={`/operator/clients/${clientId}/channels`} />
              <div className="flex items-center justify-between gap-4">
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
                <p className="rounded-md bg-danger-bg p-2 text-xs text-danger">{channel.last_health_error}</p>
              ) : null}
              {channel.last_outbound_error ? (
                <p className="rounded-md bg-danger-bg p-2 text-xs text-danger">
                  Last send failed: {channel.last_outbound_error}
                </p>
              ) : null}
              {channel.kind === "whatsapp" || channel.kind === "telegram" ? (
                <div className="rounded-md bg-surface p-3 text-xs text-muted">
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
                  <p className="mt-1">
                    For local testing, expose port 3000 with an HTTPS tunnel and set APP_BASE_URL to that public URL.
                  </p>
                </div>
              ) : null}
              <ChannelReadinessChecklist channel={channel} />
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
                defaultValue={JSON.stringify(
                  channel.kind === "whatsapp"
                    ? settingsWithoutEscalationHoldingReply(channel.settings)
                    : channel.settings,
                  null,
                  2,
                )}
                className="w-full rounded-md border border-line px-3 py-2 font-mono text-xs"
              />
              {channel.kind === "whatsapp" ? (
                <label className="block space-y-2 text-sm font-medium">
                  <span>Escalation holding reply</span>
                  <textarea
                    name="escalationHoldingReply"
                    rows={3}
                    defaultValue={getEscalationHoldingReply(channel.settings)}
                    className="w-full rounded-md border border-line px-3 py-2 text-sm font-normal"
                  />
                </label>
              ) : null}
              <textarea
                name="credentials"
                rows={3}
                defaultValue={JSON.stringify(channel.credentials, null, 2)}
                className="w-full rounded-md border border-line px-3 py-2 font-mono text-xs"
              />
              <button className="ui-button px-3 py-2">
                Save channel
              </button>
              <button
                form={`health-${channel.id}`}
                className="ml-2 ui-button px-3 py-2"
              >
                Check health
              </button>
            </form>
          ))
        )}
        {channels.map((channel) => (
          <form key={`health-${channel.id}`} id={`health-${channel.id}`} action="/api/operator/channel-health" method="post">
            <input type="hidden" name="clientId" value={clientId} />
            <input type="hidden" name="channelId" value={channel.id} />
            <input type="hidden" name="returnTo" value={`/operator/clients/${clientId}/channels`} />
          </form>
        ))}
      </div>
    </div>
  );
}

type ChannelReadinessCheck = {
  label: string;
  tone: "green" | "amber" | "red";
  detail: string;
};

function ChannelReadinessChecklist({ channel }: { channel: Channel }) {
  const checks = channelReadinessChecks(channel);

  return (
    <div className="rounded-md border border-line p-3">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold">Readiness checklist</p>
        <Badge tone={checks.every((check) => check.tone === "green") ? "green" : "amber"}>
          {checks.filter((check) => check.tone === "green").length}/{checks.length} ready
        </Badge>
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        {checks.map((check) => (
          <div key={check.label} className="rounded-md bg-surface p-2 text-xs">
            <div className="flex items-center justify-between gap-2">
              <p className="font-medium text-foreground">{check.label}</p>
              <Badge tone={check.tone}>{check.tone === "green" ? "ready" : check.tone}</Badge>
            </div>
            <p className="mt-1 text-muted">{check.detail}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function channelReadinessChecks(channel: Channel): ChannelReadinessCheck[] {
  const checks: ChannelReadinessCheck[] = [
    {
      label: "Channel status",
      tone: channel.status === "active" ? "green" : "amber",
      detail:
        channel.status === "active"
          ? "Channel is active."
          : "Set status to active only after credentials and webhooks are verified.",
    },
    {
      label: "Health check",
      tone: channel.last_health_status === "healthy" ? "green" : "amber",
      detail: channel.last_health_status
        ? `Last health status: ${channel.last_health_status}.`
        : "Run Check health after saving credentials.",
    },
    {
      label: "Outbound status",
      tone: channel.last_outbound_error ? "red" : "green",
      detail: channel.last_outbound_error
        ? "Last outbound send failed; inspect the error before going live."
        : "No outbound send failure recorded.",
    },
  ];

  if (channel.kind === "whatsapp") {
    checks.push(
      jsonStringCheck(channel.credentials.accessToken, "Access token"),
      {
        label: "Phone number ID",
        tone:
          jsonString(channel.credentials.phoneNumberId) || channel.external_id
            ? "green"
            : "red",
        detail: "Required for WhatsApp Cloud API sends and health checks.",
      },
      jsonStringCheck(channel.credentials.appSecret, "App secret"),
      jsonStringCheck(channel.settings.verifyToken, "Webhook verify token"),
      jsonStringCheck(channel.settings.ownerPhone, "Owner WhatsApp phone"),
      {
        label: "Proactive template guard",
        tone: "green",
        detail:
          "Plain proactive WhatsApp sends are blocked unless future code uses an approved template path.",
      },
    );
  }

  if (channel.kind === "telegram") {
    checks.push(
      jsonStringCheck(channel.credentials.botToken, "Bot token"),
      jsonStringCheck(channel.settings.webhookSecret, "Webhook secret"),
      jsonStringCheck(channel.settings.ownerChatId, "Owner Telegram chat"),
    );
  }

  if (channel.kind === "console") {
    checks.push({
      label: "Live channel",
      tone: "amber",
      detail: "Console is local QA only and does not receive external customer traffic.",
    });
  }

  return checks;
}

function jsonStringCheck(value: unknown, label: string): ChannelReadinessCheck {
  return {
    label,
    tone: jsonString(value) ? "green" : "red",
    detail: `${label} ${jsonString(value) ? "is configured." : "is missing."}`,
  };
}

function jsonString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function OperatorKnowledgeIngestion({ clientId }: { clientId: string }) {
  return (
    <div className="ui-panel">
      <div className="ui-panel-header">
        <h2 className="text-base font-semibold">Add knowledge</h2>
      </div>
      <form action="/api/operator/knowledge" method="post" encType="multipart/form-data" className="space-y-3 p-4">
        <input type="hidden" name="clientId" value={clientId} />
        <input type="hidden" name="returnTo" value={`/operator/clients/${clientId}/knowledge`} />
        <input
          name="title"
          className="w-full rounded-md border border-line px-3 py-2 text-sm"
          placeholder="Source title, optional for uploads and websites"
        />
        <input
          name="url"
          type="url"
          className="w-full rounded-md border border-line px-3 py-2 text-sm"
          placeholder="Website URL"
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <input
            name="crawlDepth"
            type="number"
            min="0"
            max="2"
            defaultValue="1"
            className="w-full rounded-md border border-line px-3 py-2 text-sm"
            placeholder="Crawl depth"
          />
          <input
            name="maxPages"
            type="number"
            min="1"
            max="10"
            defaultValue="5"
            className="w-full rounded-md border border-line px-3 py-2 text-sm"
            placeholder="Max pages"
          />
        </div>
        <p className="text-xs text-muted">
          Website ingestion fetches static same-origin HTML only.
        </p>
        <textarea
          name="content"
          rows={8}
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
        <button className="ui-primary-button px-4 py-2">
          Add source
        </button>
      </form>
    </div>
  );
}

export function OperatorKnowledgeSources({
  clientId,
  sources,
}: {
  clientId: string;
  sources: KnowledgeSourceSummary[];
}) {
  return (
    <div className="ui-panel">
      <div className="ui-panel-header">
        <h2 className="text-base font-semibold">Knowledge sources</h2>
      </div>
      <div className="divide-y divide-line">
        {sources.length === 0 ? (
          <p className="p-4 text-sm text-muted">No knowledge sources yet.</p>
        ) : (
          sources.map((source) => (
            <div key={source.id} id={`source-${source.id}`} className="flex items-center justify-between gap-4 p-4">
              <div>
                <p className="font-medium">{source.title}</p>
                <p className="text-sm text-muted">
                  {source.source_type} · {source.chunk_count} chunks
                </p>
              </div>
              <Link
                href={`/operator/clients/${clientId}/knowledge/${source.id}`}
                className="text-sm font-medium text-accent"
                title="View source"
              >
                View
              </Link>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export function OperatorConversationReview({
  clientId,
  conversation,
  messages,
  returnTo,
}: {
  clientId: string;
  conversation: ConversationWithLastMessage | null;
  messages: Message[];
  returnTo: string;
}) {
  if (!conversation) {
    return (
      <div className="ui-panel">
        <div className="ui-panel-header">
          <h2 className="text-base font-semibold">Conversation review</h2>
        </div>
        <p className="p-4 text-sm text-muted">No conversations yet.</p>
      </div>
    );
  }

  return (
    <div id={`conversation-${conversation.id}`} className="ui-panel">
      <div className="ui-panel-header">
        <h2 className="text-base font-semibold">Conversation review</h2>
      </div>
      <div className="p-4">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <p className="font-medium">{conversation.customer_name ?? conversation.customer_handle}</p>
          <Badge tone={conversation.status === "escalated" ? "red" : "green"}>{conversation.status}</Badge>
        </div>
        <div className="space-y-3">
          {messages.map((message) => (
            <div key={message.id} className="rounded-md bg-surface p-3 text-sm">
              <p className="mb-1 font-medium">{message.sender_role}</p>
              <p className="text-muted">{message.body}</p>
            </div>
          ))}
        </div>
        <form action="/api/operator/reviews" method="post" className="mt-4 grid gap-3 sm:grid-cols-2">
          <input type="hidden" name="clientId" value={clientId} />
          <input type="hidden" name="conversationId" value={conversation.id} />
          <input type="hidden" name="returnTo" value={returnTo} />
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
          <button className="ui-primary-button px-4 py-2 sm:col-span-2">
            Save review
          </button>
        </form>
      </div>
    </div>
  );
}

export function OperatorOffboardingPanel({ client }: { client: Client }) {
  return (
    <section className="ui-panel">
      <div className="ui-panel-header">
        <h2 className="text-base font-semibold">Offboarding</h2>
      </div>
      <div className="grid gap-4 p-4 md:grid-cols-2">
        <form action="/api/operator/offboarding" method="post" className="space-y-3">
          <input type="hidden" name="action" value="export" />
          <input type="hidden" name="clientId" value={client.id} />
          <p className="text-sm text-muted">
            Export conversations, knowledge sources, brand voice, configuration, reviews, and redacted channel setup.
          </p>
          <button className="ui-button px-3 py-2">
            Export client data
          </button>
        </form>
        <form action="/api/operator/offboarding" method="post" className="space-y-3">
          <input type="hidden" name="action" value="delete" />
          <input type="hidden" name="clientId" value={client.id} />
          <input
            name="confirmSlug"
            className="w-full rounded-md border border-line px-3 py-2 text-sm"
            placeholder={`Type ${client.slug} to delete`}
          />
          <button className="rounded-md bg-danger px-3 py-2 text-sm font-semibold text-white">
            Delete client data
          </button>
        </form>
      </div>
    </section>
  );
}
