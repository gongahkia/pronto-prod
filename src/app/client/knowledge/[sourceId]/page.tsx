import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getAssistantDraft } from "@/lib/assistant-drafts";
import { getClient } from "@/lib/dashboard";
import {
  getKnowledgeSourceForClient,
  getKnowledgeSourceVersionsForClient,
} from "@/lib/knowledge/manage";
import { AppShell } from "@/components/shell";
import {
  KnowledgeSourceDiagnostics,
  KnowledgeSourceVersionHistory,
} from "@/components/knowledge-source-panels";

export default async function ClientKnowledgeSourcePage({
  params,
}: {
  params: Promise<{ sourceId: string }>;
}) {
  const user = await requireUser("client");
  if (!user.clientId) {
    throw new Error("Client user is missing a client assignment.");
  }

  const { sourceId } = await params;
  const [client, source, versions, draft] = await Promise.all([
    getClient(user.clientId),
    getKnowledgeSourceForClient(sourceId, user.clientId),
    getKnowledgeSourceVersionsForClient(sourceId, user.clientId),
    getAssistantDraft(user.clientId),
  ]);
  if (!client) {
    throw new Error("Client record not found.");
  }
  const change = draft?.knowledge_changes[sourceId];
  if (!source && !change) {
    notFound();
  }
  const title = change?.title ?? source?.title ?? "";
  const content = change?.content ?? source?.content ?? "";

  return (
    <AppShell user={user} active="client" clientActive="assistant" workspaceName={client.name}>
      <div className="mb-5">
        <h1 className="text-xl font-semibold">Knowledge source</h1>
        <p className="text-sm text-muted">Propose changes for review before Pronto uses them to answer customers.</p>
      </div>
      <section className="ui-panel">
        <div className="ui-panel-header">
          <Link href="/client/knowledge" className="text-sm text-accent">
            Back to knowledge
          </Link>
          <h2 className="mt-2 text-base font-semibold">{title}</h2>
          <p className="text-sm text-muted">
            {change ? "Unpublished draft" : "Live source"}
            {source?.current_version ? ` · live v${source.current_version}` : ""}
          </p>
        </div>

        {source ? (
          <details className="border-b border-line p-4 text-sm">
            <summary className="cursor-pointer font-medium">Version history and diagnostics</summary>
            <KnowledgeSourceDiagnostics metadata={source.metadata} />
            <KnowledgeSourceVersionHistory
              currentVersion={source.current_version ? Number(source.current_version) : null}
              versions={versions}
            />
          </details>
        ) : null}

        <form action={`/api/client/knowledge/${sourceId}`} method="post" className="space-y-4 p-4">
          <input type="hidden" name="action" value="update" />
          <label className="block space-y-2 text-sm font-medium">
            <span>Title</span>
            <input
              name="title"
              defaultValue={title}
              className="w-full rounded-md border border-line px-3 py-2 text-sm font-normal"
            />
          </label>
          <label className="block space-y-2 text-sm font-medium">
            <span>Content</span>
            <textarea
              name="content"
              rows={18}
              defaultValue={content}
              className="w-full rounded-md border border-line px-3 py-2 font-mono text-xs font-normal"
            />
          </label>
          <button className="ui-primary-button px-4 py-2">
            Submit revised source for review
          </button>
        </form>

        <form action={`/api/client/knowledge/${sourceId}`} method="post" className="border-t border-line p-4">
          <input type="hidden" name="action" value="delete" />
          <button className="rounded-md bg-danger px-4 py-2 text-sm font-semibold text-white">
            {source ? "Propose source archive" : "Withdraw draft source"}
          </button>
        </form>
      </section>
    </AppShell>
  );
}
