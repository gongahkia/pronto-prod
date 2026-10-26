import { getClient } from "@/lib/dashboard";
import { getAssistantDraft, getAssistantRevision, type VoiceDraft } from "@/lib/assistant-drafts";
import { getBrandVoiceProfile } from "@/lib/brand-voice";
import { getTriageFlowForClient } from "@/lib/triage-flow-store";

export async function getBusinessReplySettings(clientId: string) {
  const [client, profile, liveFlow, draft, publication] = await Promise.all([
    getClient(clientId), getBrandVoiceProfile(clientId), getTriageFlowForClient(clientId),
    getAssistantDraft(clientId), getAssistantRevision(clientId),
  ]);
  if (!client) throw new Error("Business not found.");
  const voice: VoiceDraft = draft?.voice ?? { title: profile.document?.title ?? "Brand voice guide",
    content: profile.document?.content ?? client.brand_voice, attributes: profile.document?.attributes ?? {},
    sourceNotes: profile.document?.source_notes ?? null,
    examples: profile.examples.map(example => ({ customerMessage: example.customer_message, idealResponse: example.ideal_response,
      notes: example.notes ?? "", active: example.is_active })) };
  return { client, voice, flow: draft?.flow ?? { nodes: liveFlow.nodes, edges: liveFlow.edges }, draft, publication,
    prototypeDefault: profile.document?.attributes.demoDefault === true,
    unapprovedPrototype: profile.document?.attributes.demoDefault === true && profile.document?.attributes.approvedByRestaurant === false };
}
export type BusinessReplySettings = Awaited<ReturnType<typeof getBusinessReplySettings>>;
