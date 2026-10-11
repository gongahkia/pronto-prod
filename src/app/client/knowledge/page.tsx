import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getAssistantDraft } from "@/lib/assistant-drafts";
import { getClient, getKnowledgeSources } from "@/lib/dashboard";
import { getKnowledgeRefreshRequests } from "@/lib/knowledge/refresh";
import { AppShell } from "@/components/shell";
import { Badge } from "@/components/badge";
import { ClientAssistantNav } from "@/components/client-assistant-nav";
import { KnowledgeFileInput } from "@/components/knowledge-file-input";
import { KnowledgeRefreshPanel } from "@/components/knowledge-refresh-panel";
import { PendingSubmitButton } from "@/components/pending-submit-button";

export default async function ClientKnowledgePage({ searchParams }: {
  searchParams?: Promise<{ staged?: string }>;
}) {
  const user = await requireUser("client");
  if (!user.clientId) throw new Error("Client user is missing a client assignment.");
  const [client, sources, refreshRequests, draft, params] = await Promise.all([
    getClient(user.clientId),
    getKnowledgeSources(user.clientId),
    getKnowledgeRefreshRequests(user.clientId),
    getAssistantDraft(user.clientId),
    searchParams ?? Promise.resolve({} as { staged?: string }),
  ]);
  if (!client) throw new Error("Client record not found.");
  const changes = draft?.knowledge_changes ?? {};
  const rows = [
    ...sources.map((source) => ({
      id: source.id,
      title: changes[source.id]?.title ?? source.title,
      kind: source.source_type,
      draftAction: changes[source.id]?.action ?? null,
    })),
    ...Object.values(changes)
      .filter((change) => !sources.some((source) => source.id === change.sourceId))
      .map((change) => ({
        id: change.sourceId, title: change.title,
        kind: change.sourceType, draftAction: change.action,
      })),
  ];
  const openRefreshes = refreshRequests.filter((item) => item.status === "open");

  return (
    <AppShell user={user} active="client" clientActive="assistant" workspaceName={client.name}>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Knowledge</h1>
          <p className="text-sm text-muted">The business information Pronto can use to answer customers.</p>
        </div>
        <a href="#add-source" className="ui-primary-button px-4 py-2">Add source</a>
      </div>
      <ClientAssistantNav active="knowledge" />
      {params.staged ? (
        <p role="status" className="mb-4 rounded-md bg-success-bg p-3 text-sm text-success">
          Saved as a draft. Test and publish it from Manage assistant when ready.
        </p>
      ) : null}
      <section className="ui-panel">
        <div className="ui-panel-header">
          <div>
            <h2 className="font-semibold">Sources</h2>
            <p className="text-sm text-muted">Review what is live and what is waiting to be published.</p>
          </div>
          <Badge>{rows.length} sources</Badge>
        </div>
        <div className="divide-y divide-line">
          {rows.length === 0 ? <p className="p-5 text-sm text-muted">No sources yet. Add a menu, FAQ, policy, or service note below.</p> : null}
          {rows.map((source) => (
            <Link key={source.id} href={"/client/knowledge/" + source.id}
              className="flex flex-wrap items-center justify-between gap-3 p-4 hover:bg-surface-hover">
              <div>
                <p className="font-medium">{source.title}</p>
                <p className="mt-1 text-xs text-muted">{source.kind}</p>
              </div>
              {source.draftAction ? <Badge tone="amber">
                {source.draftAction === "delete" ? "Removal draft" : "Unpublished"}
              </Badge> : <Badge tone="green">Live</Badge>}
            </Link>
          ))}
        </div>
      </section>

      <section id="add-source" className="mt-5 ui-panel">
        <div className="ui-panel-header">
          <div>
            <h2 className="font-semibold">Add knowledge</h2>
            <p className="text-sm text-muted">Paste text or upload a supported document. The source stays in draft until publication.</p>
          </div>
        </div>
        <form action="/api/client/knowledge" method="post" encType="multipart/form-data" className="space-y-3 p-4">
          <label className="block text-sm font-medium">Source title
            <input name="title" className="ui-input mt-1 w-full px-3 py-2" placeholder="Menu, returns policy, opening hours..." />
          </label>
          <label className="block text-sm font-medium">Content
            <textarea name="content" rows={7} className="ui-input mt-1 w-full px-3 py-2 font-normal"
              placeholder="Paste the facts customers should be able to ask about." />
          </label>
          <KnowledgeFileInput />
          <PendingSubmitButton className="ui-primary-button px-4 py-2" pendingText="Saving draft...">
            Save source draft
          </PendingSubmitButton>
        </form>
      </section>
      <details className="mt-5" open={openRefreshes.length > 0}>
        <summary className="cursor-pointer text-sm font-medium">
          Knowledge refresh requests{openRefreshes.length ? ` · ${openRefreshes.length} open` : ""}
        </summary>
        <div className="mt-3"><KnowledgeRefreshPanel requests={refreshRequests} action="/api/client/knowledge-refresh" /></div>
      </details>
    </AppShell>
  );
}
