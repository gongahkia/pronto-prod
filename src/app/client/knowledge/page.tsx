import Link from "next/link";
import { Check, ChevronDown, GitBranch, MessageSquareText, Sparkles } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getChannels, getClient } from "@/lib/dashboard";
import { getAssistantDraft, getAssistantRevision, type VoiceDraft } from "@/lib/assistant-drafts";
import { getBrandVoiceProfile } from "@/lib/brand-voice";
import { getTriageFlowForClient } from "@/lib/triage-flow-store";
import { listChannelDrafts } from "@/lib/client-channel-drafts";
import { AppShell } from "@/components/shell";
import { Badge } from "@/components/badge";
import { KnowledgeInformationCard } from "@/components/knowledge-information-card";
import { BusinessChannelsCard, type KnowledgeChannelParams } from "@/components/business-channels-card";
import { ClientVoiceEditor } from "@/components/client-voice-editor";
import { ClientRulesEditor } from "@/components/client-rules-editor";
import { VOICE_EXAMPLE_LIMIT } from "@/lib/voice-style";

type PageSearch = KnowledgeChannelParams & { updated?: string; staged?: string; submitted?: string;
  published?: string; error?: string; section?: string };

export default async function ClientKnowledgePage({ searchParams }: { searchParams?: Promise<PageSearch> }) {
  const user = await requireUser("client");
  if (!user.clientId) throw new Error("Business assignment required.");
  const [client, channels, channelDrafts, profile, liveFlow, draft, publication, params] = await Promise.all([
    getClient(user.clientId), getChannels(user.clientId), listChannelDrafts(user.clientId), getBrandVoiceProfile(user.clientId),
    getTriageFlowForClient(user.clientId), getAssistantDraft(user.clientId), getAssistantRevision(user.clientId),
    searchParams ?? Promise.resolve({} as PageSearch),
  ]);
  if (!client) throw new Error("Business not found.");
  const voice: VoiceDraft = draft?.voice ?? { title: profile.document?.title ?? "Brand voice guide",
    content: profile.document?.content ?? client.brand_voice,
    attributes: profile.document?.attributes ?? {}, sourceNotes: profile.document?.source_notes ?? null,
    examples: profile.examples.map(example => ({ customerMessage: example.customer_message, idealResponse: example.ideal_response,
      notes: example.notes ?? "", active: example.is_active })) };
  const flow = draft?.flow ?? { nodes: liveFlow.nodes, edges: liveFlow.edges };
  const enabledRules = flow.nodes.filter(node => node.data.kind === "decision" && node.data.enabled !== false);
  const selectedExamples = voice.examples.filter(example => example.active).length;
  return <AppShell user={user} active="client" clientActive="knowledge" workspaceName={client.name}>
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-2xl font-semibold">Business Knowledge</h1>
      <p className="mt-1 text-sm text-muted">Manage what Pronto knows, how it replies and when your team steps in.</p></div>
      {draft && <Link href="/client/approvals" className="ui-button px-3 py-2 text-sm">Review pending changes</Link>}</div>
    {params.updated || params.staged || params.submitted ? <p role="status" className="mb-4 rounded-md bg-success-bg p-3 text-sm text-success">Saved for review. Customer answers have not changed.</p> : null}
    {params.published && <p role="status" className="mb-4 rounded-md bg-success-bg p-3 text-sm text-success">Revision {params.published} is live.</p>}
    {params.error && <p role="alert" className="mb-4 rounded-md bg-danger-bg p-3 text-sm text-danger">{params.error === "conflict"
      ? "The live assistant changed. Review the latest settings before editing again." : params.error}</p>}
    <div className="space-y-5">
      <KnowledgeInformationCard client={client}/>
      <div className="grid items-start gap-5 lg:grid-cols-2">
        <BusinessChannelsCard channels={channels} drafts={channelDrafts} params={params}/>
        <section id="brand-voice" className="ui-panel scroll-mt-6 overflow-hidden" aria-labelledby="brand-voice-heading">
          <div className="p-5"><div className="flex flex-wrap items-center gap-3"><Sparkles size={20} className="text-accent" aria-hidden="true"/>
            <h2 id="brand-voice-heading" className="text-lg font-semibold">Brand voice</h2>
            <span className="ml-auto"><Badge tone={draft?.voice ? "amber" : "neutral"}>{draft?.voice ? "Unpublished draft" : profile.document?.attributes.demoDefault === true ? "Prototype default" : "In use"}</Badge></span></div>
            <p className="mt-2 text-sm text-muted">Tone, reply length and example wording.</p>
            <p className="mt-2 text-xs leading-5 text-muted">{draft?.voice ? "Showing your saved draft. Customer replies still use the current published style." : publication.revision ? `Used in customer replies · live revision ${publication.revision}.` : "Currently used in customer replies."}{profile.document?.attributes.demoDefault === true && profile.document?.attributes.approvedByRestaurant === false ? " Restaurant approval has not been recorded for the current prototype style." : ""}</p>
            <blockquote className="mt-4 border-l-2 border-accent/30 pl-3 text-sm leading-6 text-foreground">
              {voice.content.replace(/^Demonstration default, pending restaurant approval:\s*/i, "").slice(0, 220)}{voice.content.length > 220 ? "…" : ""}
            </blockquote>
            <p className="mt-3 flex items-center gap-2 text-xs text-muted"><MessageSquareText size={15} aria-hidden="true"/>
              {selectedExamples ? `Up to ${Math.min(selectedExamples, VOICE_EXAMPLE_LIMIT)} of ${selectedExamples} selected examples used per reply` : "No style examples selected"}</p>
            <p className="mt-2 text-xs leading-5 text-muted">Select up to {VOICE_EXAMPLE_LIMIT} examples. Examples shape wording; approved Knowledge supplies the facts. The reply context budget may reduce the examples included.</p>
          </div>
          <details className="group border-t border-line" open={params.section === "voice"}>
            <summary className="flex cursor-pointer list-none items-center gap-2 px-5 py-4 text-sm font-medium [&::-webkit-details-marker]:hidden">Edit brand voice<ChevronDown size={16} className="ml-auto transition-transform group-open:rotate-180" aria-hidden="true"/></summary>
            <div className="px-5 pb-5"><ClientVoiceEditor initialVoice={voice} initialVersion={draft?.edit_version ?? 0} embedded/></div>
          </details>
        </section>
      </div>
      <section id="handoff-rules" className="ui-panel scroll-mt-6 overflow-hidden" aria-labelledby="handoff-heading">
        <div className="p-5"><div className="flex flex-wrap items-center gap-3"><GitBranch size={20} className="text-accent" aria-hidden="true"/>
          <h2 id="handoff-heading" className="text-lg font-semibold">Handoff rules</h2>
          <span className="ml-auto"><Badge tone={draft?.flow ? "amber" : "neutral"}>{draft?.flow ? "Unpublished draft" : "In use"}</Badge></span></div>
          <p className="mt-2 text-sm text-muted">When the model should involve your team and pause assistant replies.</p>
          <p className="mt-2 text-xs leading-5 text-muted">{draft?.flow ? "Showing your saved draft. The current published policy still applies." : "Current review policies. Safety and action restrictions also apply."}</p>
          {enabledRules.length ? <ul className="mt-4 grid gap-x-6 gap-y-2 sm:grid-cols-2 xl:grid-cols-3">{enabledRules.map(rule => <li key={rule.id} className="flex items-start gap-2 text-sm">
            <Check size={16} className="mt-0.5 shrink-0 text-success" aria-hidden="true"/>{rule.data.label}</li>)}</ul> : <p className="mt-3 text-sm text-muted">No optional handoff rules enabled.</p>}
        </div>
        <details className="group border-t border-line" open={params.section === "rules"}>
          <summary className="flex cursor-pointer list-none items-center gap-2 px-5 py-4 text-sm font-medium [&::-webkit-details-marker]:hidden">Edit handoff rules<ChevronDown size={16} className="ml-auto transition-transform group-open:rotate-180" aria-hidden="true"/></summary>
          <div className="px-5 pb-5"><ClientRulesEditor initialFlow={flow} initialVersion={draft?.edit_version ?? 0} embedded/></div>
        </details>
      </section>
    </div>
  </AppShell>;
}
