import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
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

export const dynamic = "force-dynamic";

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
  const [client, source, versions] = await Promise.all([
    getClient(user.clientId),
    getKnowledgeSourceForClient(sourceId, user.clientId),
    getKnowledgeSourceVersionsForClient(sourceId, user.clientId),
  ]);
  if (!client) {
    throw new Error("Client record not found.");
  }
  if (!source) {
    notFound();
  }

  return (
    <AppShell user={user} active="client" clientActive="knowledge" workspaceName={client.name}>
      <div className="mb-5">
        <h1 className="text-xl font-semibold tracking-[-0.01em]">Knowledge source</h1>
        <p className="text-sm text-muted">Review and edit what Pronto can use when answering customers.</p>
      </div>
      <section className="ui-panel">
        <div className="ui-panel-header">
          <Link href="/client/knowledge" className="text-sm text-accent">
            Back to knowledge
          </Link>
          <h2 className="mt-2 text-base font-semibold">{source.title}</h2>
          <p className="text-sm text-muted">
            {source.source_type} · {source.chunk_count} chunks
            {source.current_version ? ` · v${source.current_version}` : ""}
          </p>
        </div>

        <KnowledgeSourceDiagnostics metadata={source.metadata} />
        <KnowledgeSourceVersionHistory
          currentVersion={source.current_version ? Number(source.current_version) : null}
          versions={versions}
        />

        <form action={`/api/client/knowledge/${source.id}`} method="post" className="space-y-4 p-4">
          <input type="hidden" name="action" value="update" />
          <label className="block space-y-2 text-sm font-medium">
            <span>Title</span>
            <input
              name="title"
              defaultValue={source.title}
              className="w-full rounded-md border border-line px-3 py-2 text-sm font-normal"
            />
          </label>
          <label className="block space-y-2 text-sm font-medium">
            <span>Content</span>
            <textarea
              name="content"
              rows={18}
              defaultValue={source.content}
              className="w-full rounded-md border border-line px-3 py-2 font-mono text-xs font-normal"
            />
          </label>
          <button className="ui-primary-button px-4 py-2">
            Save changes
          </button>
        </form>

        <form action={`/api/client/knowledge/${source.id}`} method="post" className="border-t border-line p-4">
          <input type="hidden" name="action" value="delete" />
          <button className="rounded-md bg-danger px-4 py-2 text-sm font-semibold text-white">
            Delete source
          </button>
        </form>
      </section>
    </AppShell>
  );
}
