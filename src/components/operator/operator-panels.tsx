import { ArrowRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { appBaseUrl } from "@/lib/env";
import { channelDefinition, channelDefinitions } from "@/lib/channels/catalog";
import {
  getEscalationHoldingReply,
  settingsWithoutEscalationHoldingReply,
} from "@/lib/channels/escalation-handoff";
import type {
  ClientConversationTriage,
  EscalationWithContext,
  KnowledgeSourceSummary,
} from "@/lib/dashboard";
import type { Channel, ChannelKind, Client, Message } from "@/lib/types";
import { Badge } from "@/components/badge";
import { ConversationReviewPanel } from "@/components/conversation-review-panel";
import { DeliveryStatusBadge } from "@/components/delivery-status";
import { EscalationOutboundStatus } from "@/components/escalation-outbound-status";
import { KnowledgeFileInput } from "@/components/knowledge-file-input";
import { PendingSubmitButton } from "@/components/pending-submit-button";

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
  activeChannelKind,
}: {
  clientId: string;
  channels: Channel[];
  activeChannelKind?: ChannelKind;
}) {
  const channelByKind = new Map(channels.map((channel) => [channel.kind, channel]));
  const activeKind =
    activeChannelKind ??
    channelDefinitions.find((definition) => channelByKind.has(definition.kind))?.kind ??
    channelDefinitions[0].kind;
  const activeDefinition = channelDefinition(activeKind);
  const activeChannels = channels.filter((channel) => channel.kind === activeKind);

  return (
    <div className="ui-panel">
      <div className="ui-panel-header">
        <h2 className="text-base font-semibold">Channel setup</h2>
      </div>
      <div className="border-b border-line p-3">
        <nav aria-label="Channel setup" className="flex gap-2 overflow-x-auto">
          {channelDefinitions.map((definition) => {
            const channel = channelByKind.get(definition.kind);
            const isActive = definition.kind === activeKind;
            return (
              <Link
                key={definition.kind}
                href={`/operator/clients/${clientId}/channels?channel=${definition.kind}`}
                aria-current={isActive ? "page" : undefined}
                className={`inline-flex shrink-0 items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium ${
                  isActive
                    ? "border-accent bg-accent-soft text-foreground"
                    : "border-line bg-panel text-muted hover:bg-surface-hover hover:text-foreground"
                }`}
              >
                <Image
                  src={definition.iconPath}
                  alt=""
                  width={20}
                  height={20}
                  className="h-5 w-5 shrink-0"
                />
                <span>{definition.label}</span>
                <Badge tone={channel?.status === "active" ? "green" : "amber"}>
                  {channel?.status ?? "missing"}
                </Badge>
              </Link>
            );
          })}
        </nav>
      </div>
      <div>
        {channels.length === 0 ? (
          <p className="p-4 text-sm text-muted">No channels have been created for this client.</p>
        ) : activeChannels.length === 0 ? (
          <p className="p-4 text-sm text-muted">
            No {activeDefinition.label} channel has been created for this client.
          </p>
        ) : (
          activeChannels.map((channel) => (
            <form key={channel.id} action="/api/operator/channels" method="post" className="space-y-3 p-4">
              <input type="hidden" name="clientId" value={clientId} />
              <input type="hidden" name="channelId" value={channel.id} />
              <input type="hidden" name="returnTo" value={`/operator/clients/${clientId}/channels?channel=${channel.kind}`} />
              <div className="flex items-center justify-between gap-4">
                <div className="flex min-w-0 items-center gap-3">
                  <Image
                    src={channelDefinition(channel.kind).iconPath}
                    alt=""
                    width={32}
                    height={32}
                    className="h-8 w-8 shrink-0"
                  />
                  <div className="min-w-0">
                    <p className="font-medium">{channel.name}</p>
                    <p className="text-sm text-muted">
                      {channel.kind}
                      {channel.last_health_status ? ` · health ${channel.last_health_status}` : ""}
                    </p>
                  </div>
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
              {channelDefinition(channel.kind).webhookLabel ? (
                <div className="rounded-md bg-surface p-3 text-xs text-muted">
                  <p className="font-medium text-foreground">
                    {channelDefinition(channel.kind).webhookLabel}
                  </p>
                  <p className="mt-1 break-all font-mono">
                    {appBaseUrl()}/api/webhooks/{channel.kind}/{channel.id}
                  </p>
                  <p className="mt-2">{channelDefinition(channel.kind).webhookHint}</p>
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
              <ChannelStructuredFields channel={channel} />
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
              <PendingSubmitButton className="ui-button px-3 py-2" pendingText="Saving...">
                Save channel
              </PendingSubmitButton>
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
            <input type="hidden" name="returnTo" value={`/operator/clients/${clientId}/channels?channel=${channel.kind}`} />
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

type ChannelField = {
  scope: "settings" | "credentials";
  name: string;
  label: string;
  secret?: boolean;
  kind?: "text" | "select";
  options?: string[];
};

const channelFields: Record<ChannelKind, ChannelField[]> = {
  whatsapp: [
    { scope: "credentials", name: "accessToken", label: "Access token", secret: true },
    { scope: "credentials", name: "phoneNumberId", label: "Phone number ID" },
    { scope: "credentials", name: "appSecret", label: "App secret", secret: true },
    { scope: "settings", name: "verifyToken", label: "Webhook verify token", secret: true },
    { scope: "settings", name: "ownerPhone", label: "Owner WhatsApp phone" },
  ],
  telegram: [
    { scope: "credentials", name: "botToken", label: "Bot token", secret: true },
    { scope: "settings", name: "webhookSecret", label: "Webhook secret", secret: true },
    { scope: "settings", name: "ownerChatId", label: "Owner Telegram chat" },
  ],
  messenger: [
    { scope: "credentials", name: "pageAccessToken", label: "Page access token", secret: true },
    { scope: "credentials", name: "pageId", label: "Facebook Page ID" },
    { scope: "credentials", name: "appSecret", label: "App secret", secret: true },
    { scope: "settings", name: "verifyToken", label: "Webhook verify token", secret: true },
  ],
  instagram: [
    { scope: "settings", name: "authMode", label: "Instagram authentication", kind: "select", options: ["facebook_login", "instagram_login"] },
    { scope: "credentials", name: "pageAccessToken", label: "Page access token", secret: true },
    { scope: "credentials", name: "instagramAccessToken", label: "Instagram Login token", secret: true },
    { scope: "credentials", name: "tokenExpiresAt", label: "Instagram Login token expiry (ISO date)" },
    { scope: "credentials", name: "appSecret", label: "App secret", secret: true },
    { scope: "credentials", name: "igUserId", label: "Instagram user ID" },
    { scope: "settings", name: "verifyToken", label: "Webhook verify token", secret: true },
  ],
  email: [
    {
      scope: "credentials",
      name: "provider",
      label: "Email provider",
      kind: "select",
      options: ["postmark", "resend", "local_smtp"],
    },
    { scope: "credentials", name: "apiKey", label: "API key", secret: true },
    { scope: "credentials", name: "fromAddress", label: "From address" },
    { scope: "settings", name: "webhookSecret", label: "Inbound webhook secret", secret: true },
    { scope: "settings", name: "eventWebhookSecret", label: "Event webhook secret", secret: true },
    { scope: "settings", name: "defaultSubject", label: "Default reply subject" },
  ],
};

function ChannelStructuredFields({ channel }: { channel: Channel }) {
  const fields = (channelFields as Partial<Record<string, ChannelField[]>>)[channel.kind] ?? [];
  if (!fields.length) {
    return <p className="rounded-md bg-surface p-3 text-xs text-muted">No channel credentials required.</p>;
  }

  const visibleSettings =
    channel.kind === "whatsapp"
      ? settingsWithoutEscalationHoldingReply(channel.settings)
      : channel.settings;

  return (
    <div className="grid gap-3 md:grid-cols-2">
      {fields.map((field) => {
        const source = field.scope === "settings" ? visibleSettings : channel.credentials;
        const current = source[field.name];
        const name = `${field.scope}.${field.name}`;
        if (field.kind === "select") {
          return (
            <label key={name} className="block text-sm">
              <span className="font-medium">{field.label}</span>
              <select
                name={name}
                defaultValue={typeof current === "string" ? current : field.options?.[0]}
                className="ui-input mt-1 block w-full px-3 py-2"
              >
                {(field.options ?? []).map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
          );
        }
        return (
          <label key={name} className="block text-sm">
            <span className="font-medium">{field.label}</span>
            <input
              name={name}
              type={field.secret ? "password" : "text"}
              defaultValue={field.secret ? "" : typeof current === "string" ? current : ""}
              placeholder={field.secret && typeof current === "string" && current ? "Saved; leave blank to keep" : ""}
              autoComplete={field.secret ? "new-password" : undefined}
              className="ui-input mt-1 block w-full px-3 py-2"
            />
          </label>
        );
      })}
    </div>
  );
}

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
          placeholder="Source title, optional for uploads"
        />
        <textarea
          name="content"
          rows={8}
          className="w-full rounded-md border border-line px-3 py-2 text-sm"
          placeholder="Paste FAQ, menu, policy, or brand content"
        />
        <KnowledgeFileInput />
        <PendingSubmitButton className="ui-primary-button px-4 py-2" pendingText="Adding...">
          Add source
        </PendingSubmitButton>
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
  conversation,
  messages,
}: {
  conversation: ClientConversationTriage | null;
  messages: Message[];
}) {
  return <ConversationReviewPanel conversation={conversation} messages={messages} />;
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
            Export conversations, knowledge sources, brand voice, configuration, and redacted channel setup.
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
