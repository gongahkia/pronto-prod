import type { Conversation } from "@/lib/types";
import type { EscalationPolicy } from "@/lib/staff-configuration";
import { Badge } from "@/components/badge";

export function ConversationClassificationPanel({ conversation, canRespond, policy }: {
  conversation: Conversation; canRespond: boolean; policy: EscalationPolicy | null;
}) {
  return <section className="ui-panel mb-4 p-4" aria-label="Conversation classification">
    <h2 className="font-semibold">Classification and ownership</h2>
    <div className="my-3 flex flex-wrap gap-2">
      <Badge>AI responds: {conversation.ai_should_respond == null ? "pending" : conversation.ai_should_respond ? "yes" : "no"}</Badge>
      <Badge tone={conversation.owner_action_required ? "amber" : "neutral"}>Owner action: {conversation.owner_action_required ? "required" : "not required"}</Badge>
      <Badge>{conversation.urgency === "short_term" ? "Short-term" : conversation.urgency === "long_term" ? "Long-term" : "Urgency pending"}</Badge>
    </div>
    <p className="text-xs text-muted">{conversation.status === "active" ? "AI owns this conversation. An owner review flag does not pause AI." : "Human-owned. AI stays paused until explicit authorized release."}</p>
    <p className="mt-2 text-xs text-muted">Business response target: {policy?.targetMinutes == null ? "Not set" : `${policy.targetMinutes} minutes`}.
      {policy ? ` Timezone: ${policy.timezone}. Staffed hours and notifications follow the existing business policy.` : " No SLA is inferred."}</p>
    <p className="mt-2 text-xs text-muted">Urgent/negative-sentiment handoffs start short-term; other new outcomes start long-term. Your team can review this label. Holding acknowledgements are separate from an AI answer.</p>
    {canRespond && conversation.status !== "closed" && <>
      <form action={`/api/client/conversations/${conversation.id}`} method="post" className="mt-3 space-y-2">
        <input type="hidden" name="action" value="classify"/>
        <label className="block text-xs">Urgency<select aria-label="Conversation urgency" name="urgency" className="ui-input mt-1 w-full px-2 py-2 text-sm" defaultValue={conversation.urgency ?? "long_term"}>
          <option value="short_term">Short-term</option><option value="long_term">Long-term</option></select></label>
        <label className="block text-xs">Owner review<select aria-label="Owner action required" name="ownerActionRequired" className="ui-input mt-1 w-full px-2 py-2 text-sm" defaultValue={String(conversation.owner_action_required ?? false)}>
          <option value="true">Required</option><option value="false">Not required</option></select></label>
        <button className="ui-button px-3 py-2 text-sm">Save classification</button>
      </form>
      {conversation.status === "active" && <form action={`/api/client/conversations/${conversation.id}`} method="post" className="mt-3">
        <input type="hidden" name="action" value="takeover"/>
        <button className="ui-primary-button px-3 py-2 text-sm">Take over and pause AI</button></form>}
    </>}
  </section>;
}
