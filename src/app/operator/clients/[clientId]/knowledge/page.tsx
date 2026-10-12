import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getClient, getKnowledgeSources } from "@/lib/dashboard";
import { getAssistantDraft } from "@/lib/assistant-drafts";
import { getChannels } from "@/lib/dashboard";
import { AssistantTester } from "@/components/assistant-tester";
import { getKnowledgeRefreshRequests } from "@/lib/knowledge/refresh";
import { listKnowledgeSuggestions } from "@/lib/knowledge/suggestions";
import { AppShell } from "@/components/shell";
import { KnowledgeRefreshPanel } from "@/components/knowledge-refresh-panel";
import {
  OperatorClientHeader,
  OperatorClientNav,
} from "@/components/operator/operator-nav";
import {
  OperatorKnowledgeIngestion,
  OperatorKnowledgeSources,
} from "@/components/operator/operator-panels";

export default async function OperatorClientKnowledgePage({
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

  const [knowledge, refreshRequests, draft, channels, suggestions] = await Promise.all([
    getKnowledgeSources(client.id),
    getKnowledgeRefreshRequests(client.id),
    getAssistantDraft(client.id), getChannels(client.id), listKnowledgeSuggestions(client.id),
  ]);

  return (
    <AppShell user={user} active="operator">
      <OperatorClientHeader
        client={client}
        description="Add and inspect the sources that ground this client's assistant."
      />
      <OperatorClientNav clientId={client.id} active="knowledge" />
      <section className="ui-panel mb-5"><div className="ui-panel-header"><h2 className="font-semibold">Business correction proposals</h2>
        <p className="text-sm text-muted">Pronto prepares approved suggestions for a private assistant test and final revision approval.</p></div>
        {suggestions.length ? <ul className="divide-y divide-line">{suggestions.map((item) => <li key={item.id} className="p-4 text-sm">
          <strong>{item.title}</strong> · revision {item.current_revision} · {item.status.replace(/_/g, " ")}
          <p className="mt-1 text-muted">Author: {item.author_name ?? "former staff member"} · Source: {item.source_reference ?? "not supplied"}</p>
          <details className="mt-2"><summary className="cursor-pointer">Review proposed fact and reason</summary>
            <p className="mt-2 whitespace-pre-wrap">{item.content}</p><p className="mt-1">Reason: {item.reason}</p>
            {item.review_note ? <p className="mt-1">Business review by {item.reviewer_name}: {item.review_note}</p> : null}</details>
          {item.status === "approved" ? <form action="/api/operator/knowledge-suggestions" method="post" className="mt-3">
            <input type="hidden" name="clientId" value={client.id}/><input type="hidden" name="suggestionId" value={item.id}/>
            <input type="hidden" name="revision" value={item.current_revision}/>
            <button className="ui-button px-3 py-2">Prepare this approved correction</button></form> : null}
        </li>)}</ul> : <p className="p-4 text-sm text-muted">No business correction proposals yet.</p>}
      </section>
      {draft ? <section className="ui-panel mb-5 p-4">
        <h2 className="font-semibold">Changes awaiting business approval</h2>
        <p className="text-sm">Draft revision {draft.edit_version} · {draft.tested_at ? "privately tested" : "test before publishing"}</p>
        <ul className="my-2 text-sm">{Object.values(draft.knowledge_changes).map((change) =>
          <li key={change.sourceId}>{change.action}: {change.title} · source {change.sourceType}</li>)}</ul>
        <p className="text-xs text-muted">Pronto may publish only this tested revision after an authorized business knowledge approver signs off.</p>
        <form action="/api/operator/assistant/publish" method="post" className="mt-3">
          <input type="hidden" name="clientId" value={client.id}/>
          <button className="ui-primary-button px-3 py-2" disabled={!draft.tested_at}>Publish approved revision</button>
        </form>
      </section> : null}

      <section className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <OperatorKnowledgeIngestion clientId={client.id} />
        <OperatorKnowledgeSources clientId={client.id} sources={knowledge} />
      </section>
      {draft ? <div className="mt-6"><AssistantTester
        channels={[{ id: "preview", kind: "whatsapp", name: "Private preview", status: "draft" },
          ...channels.filter((channel) => channel.status !== "disabled").map((channel) => ({
            id: channel.id, kind: channel.kind, name: channel.name, status: channel.status }))]}
        clientName={client.name} clientId={client.id} endpoint="/api/operator/assistant-test" />
      </div> : null}

      <div className="mt-6">
        <KnowledgeRefreshPanel
          requests={refreshRequests}
          action="/api/operator/knowledge-refresh"
          clientId={client.id}
        />
      </div>
    </AppShell>
  );
}
