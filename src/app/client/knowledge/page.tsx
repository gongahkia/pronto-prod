import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getClient, getKnowledgeSources } from "@/lib/dashboard";
import { getKnowledgeRefreshRequests } from "@/lib/knowledge/refresh";
import { getKnowledgeGapReport } from "@/lib/reporting";
import { AppShell } from "@/components/shell";
import { Badge } from "@/components/badge";
import { KnowledgeRefreshPanel } from "@/components/knowledge-refresh-panel";
import { KnowledgeGapPanel } from "@/components/reporting-panels";
import { StatCard } from "@/components/stat-card";

export const dynamic = "force-dynamic";

export default async function ClientKnowledgePage() {
  const user = await requireUser("client");
  if (!user.clientId) {
    throw new Error("Client user is missing a client assignment.");
  }

  const [client, knowledge, refreshRequests, gaps] = await Promise.all([
    getClient(user.clientId),
    getKnowledgeSources(user.clientId),
    getKnowledgeRefreshRequests(user.clientId),
    getKnowledgeGapReport({ clientId: user.clientId, limit: 8 }),
  ]);
  if (!client) {
    throw new Error("Client record not found.");
  }

  const openRefreshes = refreshRequests.filter((request) => request.status === "open");
  const latestSource = knowledge[0]?.created_at ?? null;

  return (
    <AppShell user={user} active="client" clientActive="knowledge" workspaceName={client.name}>
      <div className="mb-5">
        <h1 className="text-xl font-semibold tracking-[-0.01em]">Knowledge</h1>
        <p className="text-sm text-muted">
          What Pronto knows about your business, and what needs updating.
        </p>
      </div>

      <section className="grid gap-4 md:grid-cols-4">
        <StatCard label="Sources" value={knowledge.length} />
        <StatCard label="Open refreshes" value={openRefreshes.length} />
        <StatCard label="Knowledge gaps" value={gaps.length} />
        <StatCard label="Latest source" value={formatDate(latestSource)} />
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-[1fr_0.75fr]">
        <section className="ui-panel">
          <div className="ui-panel-header">
            <div>
              <h2 className="text-base font-semibold">What Pronto knows</h2>
              <p className="text-sm text-muted">
                Approved business sources that Pronto can use when answering customers.
              </p>
            </div>
            <Badge tone={knowledge.length ? "green" : "amber"}>{knowledge.length} sources</Badge>
          </div>
          <div className="divide-y divide-line">
            {knowledge.length === 0 ? (
              <p className="p-4 text-sm text-muted">No knowledge sources yet.</p>
            ) : (
              knowledge.map((source) => (
                <Link
                  key={source.id}
                  href={`/client/knowledge/${source.id}`}
                  className="flex items-center justify-between gap-4 p-4 hover:bg-surface-hover"
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{source.title}</p>
                      <Badge>{source.source_type}</Badge>
                    </div>
                    <p className="mt-1 text-sm text-muted">
                      {source.chunk_count} searchable sections · added {formatDate(source.created_at)}
                    </p>
                  </div>
                  <ArrowRight size={17} className="shrink-0 text-muted" />
                </Link>
              ))
            )}
          </div>
        </section>

        <KnowledgeGapPanel
          gaps={gaps}
          hrefForGap={(gap) => `/client/conversations/${gap.conversation_id}`}
        />
      </section>

      <div className="mt-6">
        <KnowledgeRefreshPanel
          requests={refreshRequests}
          action="/api/client/knowledge-refresh"
        />
      </div>

      <section className="mt-6 ui-panel">
        <div className="ui-panel-header">
          <div>
            <h2 className="text-base font-semibold">Add knowledge</h2>
            <p className="text-sm text-muted">
              Add menus, policies, FAQs, service notes, or website pages Pronto should rely on.
            </p>
          </div>
        </div>
        <form action="/api/client/knowledge" method="post" encType="multipart/form-data" className="space-y-3 p-4">
          <input
            name="title"
            className="w-full rounded-md border border-line px-3 py-2 text-sm"
            placeholder="Source title, optional for uploads and websites"
          />
          <input
            name="url"
            type="url"
            className="w-full rounded-md border border-line px-3 py-2 text-sm"
            placeholder="Website URL"
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <input
              name="crawlDepth"
              type="number"
              min="0"
              max="2"
              defaultValue="1"
              className="w-full rounded-md border border-line px-3 py-2 text-sm"
              placeholder="Crawl depth"
            />
            <input
              name="maxPages"
              type="number"
              min="1"
              max="10"
              defaultValue="5"
              className="w-full rounded-md border border-line px-3 py-2 text-sm"
              placeholder="Max pages"
            />
          </div>
          <p className="text-xs text-muted">
            Website ingestion fetches static same-origin HTML only.
          </p>
          <textarea
            name="content"
            rows={8}
            className="w-full rounded-md border border-line px-3 py-2 text-sm"
            placeholder="Paste menu, policy, opening hours, FAQs, or service notes"
          />
          <input
            name="file"
            type="file"
            accept=".pdf,.docx,.txt,.md,.markdown,.csv,text/plain,text/markdown,text/csv,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            className="w-full rounded-md border border-line px-3 py-2 text-sm"
          />
          <p className="text-xs text-muted">
            Supports PDF, DOCX, TXT, Markdown, and CSV up to 8 MB.
          </p>
          <button className="ui-primary-button px-4 py-2">
            Add source
          </button>
        </form>
      </section>
    </AppShell>
  );
}

function formatDate(value: Date | null): string {
  if (!value) {
    return "None";
  }
  return value.toLocaleDateString("en-SG", {
    month: "short",
    day: "numeric",
  });
}
