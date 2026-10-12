import { requireUser } from "@/lib/auth";
import { AppShell } from "@/components/shell";
import { getAssistantDraft } from "@/lib/assistant-drafts";
import { getChannels, getClient } from "@/lib/dashboard";
import { listChannelDrafts } from "@/lib/client-channel-drafts";
import { listOnboardingStages } from "@/lib/onboarding";
import { hasStaffCapability } from "@/lib/staff-permissions";

export default async function ClientApprovalsPage() {
  const actor = await requireUser("client");
  if (!actor.clientId) throw new Error("Client assignment required.");
  const clientId = actor.clientId;
  const [client, stages, draft, channelDrafts, channels, knowledgeApprover, channelActivator] = await Promise.all([
    getClient(clientId), listOnboardingStages(clientId), getAssistantDraft(clientId),
    listChannelDrafts(clientId), getChannels(clientId),
    hasStaffCapability(actor, clientId, "knowledge.approve"), hasStaffCapability(actor, clientId, "channel.activate"),
  ]);
  if (!client) throw new Error("Business not found.");
  return <AppShell user={actor} active="client" clientActive="assistant" workspaceName={client.name}>
    <h1 className="mb-2 text-xl font-semibold">Business approvals</h1>
    <p className="mb-5 text-sm text-muted">Review the current revision. Pronto publishes approved changes and activates approved channels.</p>
    <div className="space-y-4">{stages.filter((stage) => stage.state === "pending_review").map((stage) =>
      <section className="ui-panel p-4" key={stage.stage}><h2 className="font-semibold capitalize">{stage.stage} setup</h2>
        <p className="text-sm">Revision {stage.revision}</p>
        <dl className="my-2 text-sm">{Object.entries(stage.details).map(([key, value]) => <div key={key}><dt className="font-medium">{key}</dt><dd>{String(value)}</dd></div>)}</dl>
        <p className="text-xs text-muted">Evidence: {Object.values(stage.evidence).map(String).join(" · ")}</p>
        {(stage.stage === "profile" || stage.stage === "knowledge" || stage.stage === "testing" ? knowledgeApprover : channelActivator) ?
        <form action="/api/client/onboarding/approve" method="post" className="mt-3">
          <input type="hidden" name="stage" value={stage.stage}/><input type="hidden" name="revision" value={stage.revision}/>
          <button className="ui-primary-button px-3 py-2">Approve this revision</button></form>
          : <p className="mt-2 text-sm text-muted">A designated business approver must review this stage.</p>}
      </section>)}
      {draft ? <section className="ui-panel p-4"><h2 className="font-semibold">Assistant and knowledge changes</h2>
        <p className="text-sm">Revision {draft.edit_version} · {Object.keys(draft.knowledge_changes).length} source change(s)</p>
        <ul className="my-2 space-y-3 text-sm">{Object.values(draft.knowledge_changes).map((change) =>
          <li key={change.sourceId} className="rounded border border-line p-3">
            <strong>{change.action}: {change.title}</strong> · {change.sourceType}
            {change.action === "upsert" ? <p className="mt-2 whitespace-pre-wrap">{change.content}</p> : null}
            <p className="mt-2 text-xs text-muted">Source: {String(change.metadata.sourceUrl ?? change.metadata.entryMode ?? "not supplied")}</p>
          </li>)}</ul>
        {knowledgeApprover ? <form action="/api/client/approvals" method="post" className="space-y-2">
          <input type="hidden" name="kind" value="assistant"/><input type="hidden" name="revision" value={draft.edit_version}/>
          <input className="ui-input block w-full px-3 py-2" name="evidence" required aria-label="Approval evidence" placeholder="Approval note or meeting reference"/>
          <button className="ui-primary-button px-3 py-2">Approve current revision</button></form>
          : <p className="text-sm text-muted">A designated knowledge approver must review this draft.</p>}
      </section> : null}
      {channelDrafts.map((draft) => <section className="ui-panel p-4" key={draft.channel_id}>
        <h2 className="font-semibold">Customer channel: {channels.find((item) => item.id === draft.channel_id)?.name ?? draft.channel_id}</h2>
        <p className="text-sm">Proposed state: {draft.status} · health: {draft.health_status ?? "unchecked"}</p>
        {channelActivator ? <form action="/api/client/approvals" method="post" className="mt-2 space-y-2">
          <input type="hidden" name="kind" value="channel"/><input type="hidden" name="targetId" value={draft.channel_id}/>
          <input type="hidden" name="revision" value={new Date(draft.updated_at).toISOString()}/>
          <input className="ui-input block w-full px-3 py-2" name="evidence" required aria-label="Channel approval evidence" placeholder="Approval note or meeting reference"/>
          <button className="ui-primary-button px-3 py-2">Approve channel revision</button></form>
          : <p className="text-sm text-muted">A designated channel activator must approve this channel.</p>}
      </section>)}
      {channels.filter((channel) => channel.status !== "active" &&
        !channelDrafts.some((draft) => draft.channel_id === channel.id)).map((channel) =>
        <section className="ui-panel p-4" key={channel.id}>
          <h2 className="font-semibold">Customer channel: {channel.name}</h2>
          <p className="text-sm">Current state: {channel.status}. Approval covers only this configuration revision.</p>
          {channelActivator ? <form action="/api/client/approvals" method="post" className="mt-2 space-y-2">
            <input type="hidden" name="kind" value="channel"/><input type="hidden" name="targetId" value={channel.id}/>
            <input type="hidden" name="revision" value={channel.updated_at ? new Date(channel.updated_at).toISOString() : ""}/>
            <input className="ui-input block w-full px-3 py-2" name="evidence" required aria-label="Channel approval evidence" placeholder="Approval note or meeting reference"/>
            <button className="ui-primary-button px-3 py-2">Approve channel revision</button></form>
            : <p className="text-sm text-muted">A designated channel activator must approve this channel.</p>}
        </section>)}
    </div>
  </AppShell>;
}
