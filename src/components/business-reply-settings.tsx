import { Check, GitBranch, MessageSquareText, Sparkles } from "lucide-react";
import { Badge } from "@/components/badge";
import { BusinessKnowledgeCard } from "@/components/business-knowledge-card";
import type { BusinessReplySettings } from "@/lib/knowledge/reply-settings";
import { VOICE_EXAMPLE_LIMIT } from "@/lib/voice-style";

export function BrandVoiceStatus({ settings }: { settings: BusinessReplySettings }) {
  return <Badge tone={settings.draft?.voice ? "amber" : "neutral"}>{settings.draft?.voice ? "Unpublished draft" : settings.prototypeDefault ? "Prototype default" : "In use"}</Badge>;
}
export function HandoffRulesStatus({ settings }: { settings: BusinessReplySettings }) {
  return <Badge tone={settings.draft?.flow ? "amber" : "neutral"}>{settings.draft?.flow ? "Unpublished draft" : "In use"}</Badge>;
}

export function BrandVoiceSummary({ settings }: { settings: BusinessReplySettings }) {
  const { voice, draft, publication, unapprovedPrototype } = settings;
  const selected = voice.examples.filter(example => example.active).length;
  return <div className="space-y-3 px-5 pb-5">
    <p className="text-xs leading-5 text-muted">{draft?.voice ? "Showing your saved draft. Customer replies still use the current published style." : publication.revision ? `Used in customer replies · live revision ${publication.revision}.` : "Currently used in customer replies."}{unapprovedPrototype ? " Restaurant approval has not been recorded for the current prototype style." : ""}</p>
    <blockquote className="border-l-2 border-accent/30 pl-3 text-sm leading-6 text-foreground">{voice.content.replace(/^Demonstration default, pending restaurant approval:\s*/i, "").slice(0, 220)}{voice.content.length > 220 ? "…" : ""}</blockquote>
    <p className="flex items-center gap-2 text-xs text-muted"><MessageSquareText size={15} aria-hidden="true"/>{selected ? `Up to ${Math.min(selected, VOICE_EXAMPLE_LIMIT)} of ${selected} selected examples used per reply` : "No style examples selected"}</p>
    <p className="text-xs leading-5 text-muted">Select up to {VOICE_EXAMPLE_LIMIT} examples. Examples shape wording; approved Knowledge supplies the facts. The reply context budget may reduce the examples included.</p>
  </div>;
}

export function HandoffRulesSummary({ settings }: { settings: BusinessReplySettings }) {
  const enabled = settings.flow.nodes.filter(node => node.data.kind === "decision" && node.data.enabled !== false);
  return <div className="space-y-3 px-5 pb-5">
    <p className="text-xs leading-5 text-muted">{settings.draft?.flow ? "Showing your saved draft. The current published policy still applies." : "Current review policies. Safety and action restrictions also apply."}</p>
    {enabled.length ? <ul className="grid gap-x-6 gap-y-2 sm:grid-cols-2 xl:grid-cols-3">{enabled.map(rule => <li key={rule.id} className="flex items-start gap-2 text-sm"><Check size={16} className="mt-0.5 shrink-0 text-success" aria-hidden="true"/>{rule.data.label}</li>)}</ul> : <p className="text-sm text-muted">No optional handoff rules enabled.</p>}
  </div>;
}

export function BrandVoiceCard({ settings }: { settings: BusinessReplySettings }) {
  return <BusinessKnowledgeCard id="brand-voice" href="/client/knowledge/brand-voice" title="Brand voice"
    icon={<Sparkles size={20} className="text-accent" aria-hidden="true"/>} status={<BrandVoiceStatus settings={settings}/>}
    description="Tone, reply length and example wording." action="View reply style"><BrandVoiceSummary settings={settings}/></BusinessKnowledgeCard>;
}
export function HandoffRulesCard({ settings }: { settings: BusinessReplySettings }) {
  return <BusinessKnowledgeCard id="handoff-rules" href="/client/knowledge/handoff-rules" title="Handoff rules"
    icon={<GitBranch size={20} className="text-accent" aria-hidden="true"/>} status={<HandoffRulesStatus settings={settings}/>}
    description="When the model should involve your team and pause assistant replies." action="View handoff policy"><HandoffRulesSummary settings={settings}/></BusinessKnowledgeCard>;
}
