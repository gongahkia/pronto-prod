import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { enterTenantContext } from "@/lib/tenant-context";
import { getClient, getClients, getChannels, getKnowledgeSources, getConversationTriageDetail, getConversationMessages, getConversationActionableEscalation } from "@/lib/dashboard";
import { getOperationsReport, getOperationsAttention } from "@/lib/operations-report";
import { listOnboardingStages } from "@/lib/onboarding";
import { listStaffCapabilities } from "@/lib/staff-permissions";
import { listStaffDestinations, getEscalationPolicy } from "@/lib/staff-configuration";
import { getAssistantDraft } from "@/lib/assistant-drafts";
import { getAgentConfigDetail } from "@/lib/agent/config";
import { getBrandVoiceProfile } from "@/lib/brand-voice";
import { listSourceSubmissions } from "@/lib/knowledge/submissions";
import { listKnowledgeSuggestions } from "@/lib/knowledge/suggestions";
import { listKnowledgeReviewItems } from "@/lib/knowledge/review-items";
import { getKnowledgeRefreshRequests } from "@/lib/knowledge/refresh";
import { getFilteredConversations } from "@/lib/reporting";
import { query } from "@/lib/db";
import { redactForLog } from "@/lib/logger";
import { listChannelDrafts } from "@/lib/client-channel-drafts";
import { getChannelActivationSummary } from "@/lib/managed-approvals";
import { getTriageFlowForClient } from "@/lib/triage-flow-store";
import { listIntegrationCredentialStatuses } from "@/lib/integrations/credentials";
import { getKnowledgeSourceForClient, getKnowledgeSourceVersionsForClient } from "@/lib/knowledge/manage";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const json = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: { "Cache-Control": "private, no-store" } });

// Read-only companion to the existing authenticated administrative mutations.
// It never returns provider credentials, password hashes or session tokens.
export async function GET(request: Request) {
  const actor = await getSessionUser();
  if (!actor) return json({ error: "Unauthenticated." }, 401);
  if (actor.role !== "operator") return json({ error: "Operator account required." }, 403);
  enterTenantContext(actor);
  const params = new URL(request.url).searchParams;
  const view = params.get("view") ?? "clients";
  if (view === "clients") return json({ clients: (await getClients()).map(client => ({ ...client,
    business_profile: redactForLog(client.business_profile) })) });
  if (view === "operations") return json({ report: await getOperationsReport(), attention: redactForLog(await getOperationsAttention()) });
  const clientId = params.get("clientId") ?? "";
  if (!uuid.test(clientId)) return json({ error: "A valid clientId is required." }, 400);
  const client = await getClient(clientId);
  if (!client) return json({ error: "Business not found." }, 404);
  if (view === "client") {
    const [channels, onboarding, permissions, destinations, policy, users] = await Promise.all([
      getChannels(clientId), listOnboardingStages(clientId), listStaffCapabilities(clientId),
      listStaffDestinations(clientId), getEscalationPolicy(clientId),
      query("select id, client_id, email, name, role, created_at from users where client_id = $1 order by created_at", [clientId]),
    ]);
    return json({ client: { ...client, business_profile: redactForLog(client.business_profile) }, channels: channels.map(channel => ({ id: channel.id, kind: channel.kind,
      status: channel.status, external_id: channel.external_id, revision: channel.updated_at,
      last_health_status: channel.last_health_status, last_health_check_at: channel.last_health_check_at,
      settings: redactForLog(channel.settings) })),
      onboarding, permissions, destinations, policy, users: users.rows });
  }
  if (view === "knowledge") return json({ sources: await getKnowledgeSources(clientId),
    submissions: await listSourceSubmissions(clientId), suggestions: await listKnowledgeSuggestions(clientId),
    reviews: await listKnowledgeReviewItems(clientId), refresh: await getKnowledgeRefreshRequests(clientId),
    draft: await getAssistantDraft(clientId) });
  if (view === "source") {
    const sourceId = params.get("sourceId") ?? "";
    if (!uuid.test(sourceId)) return json({ error: "A valid sourceId is required." }, 400);
    const source = await getKnowledgeSourceForClient(sourceId, clientId);
    if (!source) return json({ error: "Source not found for this business." }, 404);
    return json({ source, versions: await getKnowledgeSourceVersionsForClient(sourceId, clientId) });
  }
  if (view === "channels") return json({ drafts: (await listChannelDrafts(clientId)).map(draft => ({
    channel_id: draft.channel_id, status: draft.status, external_id: draft.external_id,
    revision: draft.updated_at, base_updated_at: draft.base_updated_at,
    health_status: draft.health_status, checked_at: draft.checked_at, settings: redactForLog(draft.settings) })),
    activation: await Promise.all((await getChannels(clientId)).map(async channel => ({ channelId: channel.id,
      ...await getChannelActivationSummary(clientId, channel.id) }))),
    integrations: await listIntegrationCredentialStatuses(clientId) });
  if (view === "configuration") return json({ agent: await getAgentConfigDetail(clientId),
    voice: await getBrandVoiceProfile(clientId), flow: await getTriageFlowForClient(clientId), draft: await getAssistantDraft(clientId) });
  if (view === "conversations") {
    const offset = Number(params.get("offset") ?? 0);
    if (!Number.isSafeInteger(offset) || offset < 0 || offset > 1_000_000) return json({ error: "Invalid offset." }, 400);
    return json({ conversations: await getFilteredConversations({ clientId, limit: 75, offset }) });
  }
  if (view === "conversation") {
    const conversationId = params.get("conversationId") ?? "";
    if (!uuid.test(conversationId)) return json({ error: "A valid conversationId is required." }, 400);
    const conversation = await getConversationTriageDetail({ clientId, conversationId });
    if (!conversation) return json({ error: "Conversation not found for this business." }, 404);
    return json({ conversation, messages: await getConversationMessages(conversationId, clientId),
      escalation: await getConversationActionableEscalation({ clientId, conversationId }) });
  }
  return json({ error: "Unsupported inspection view." }, 400);
}
