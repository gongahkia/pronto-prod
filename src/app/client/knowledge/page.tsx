import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getClient, getKnowledgeSources } from "@/lib/dashboard";
import { AppShell } from "@/components/shell";
import { ClientNav } from "@/components/client-nav";

export const dynamic = "force-dynamic";

export default async function ClientKnowledgePage() {
  const user = await requireUser("client");
  if (!user.clientId) {
    throw new Error("Client user is missing a client assignment.");
  }

  const [client, knowledge] = await Promise.all([
    getClient(user.clientId),
    getKnowledgeSources(user.clientId),
  ]);
  if (!client) {
    throw new Error("Client record not found.");
  }

  return (
    <AppShell user={user} active="client">
      <div className="mb-5">
        <h1 className="text-xl font-semibold tracking-[-0.01em]">{client.name}</h1>
        <p className="text-sm text-muted">Keep the assistant grounded in current business information.</p>
      </div>
      <ClientNav active="knowledge" />

      <section className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="ui-panel">
          <div className="ui-panel-header">
            <h2 className="text-base font-semibold">Add knowledge</h2>
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
        </div>

        <div className="ui-panel">
          <div className="ui-panel-header">
            <h2 className="text-base font-semibold">Knowledge base</h2>
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
                    <p className="font-medium">{source.title}</p>
                    <p className="text-sm text-muted">
                      {source.source_type} · {source.chunk_count} chunks
                    </p>
                  </div>
                  <ArrowRight size={17} className="shrink-0 text-muted" />
                </Link>
              ))
            )}
          </div>
        </div>
      </section>
    </AppShell>
  );
}
