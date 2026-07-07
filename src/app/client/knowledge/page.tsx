import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { formatDate as formatDisplayDate } from "@/lib/date-format";
import { getClient, getKnowledgeSources } from "@/lib/dashboard";
import { getKnowledgeRefreshRequests } from "@/lib/knowledge/refresh";
import { AppShell } from "@/components/shell";
import { Badge } from "@/components/badge";
import { KnowledgeFileInput } from "@/components/knowledge-file-input";
import { KnowledgeRefreshPanel } from "@/components/knowledge-refresh-panel";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { StatCard } from "@/components/stat-card";

export default async function ClientKnowledgePage() {
  const user = await requireUser("client");
  if (!user.clientId) {
    throw new Error("Client user is missing a client assignment.");
  }

  const [client, knowledge, refreshRequests] = await Promise.all([
    getClient(user.clientId),
    getKnowledgeSources(user.clientId),
    getKnowledgeRefreshRequests(user.clientId),
  ]);
  if (!client) {
    throw new Error("Client record not found.");
  }

  const openRefreshes = refreshRequests.filter((request) => request.status === "open");
  const latestSource = knowledge[0]?.created_at ?? null;

  return (
    <AppShell user={user} active="client" clientActive="knowledge" workspaceName={client.name}>
      <div className="mb-5">
        <h1 className="text-xl font-semibold">Knowledge</h1>
        <p className="text-sm text-muted">
          What Pronto knows about your business, and what needs updating.
        </p>
      </div>

      <section className="grid gap-4 md:grid-cols-3">
        <StatCard label="Sources" value={knowledge.length} />
        <StatCard label="Open refreshes" value={openRefreshes.length} />
        <StatCard label="Latest source" value={formatKnowledgeDate(latestSource)} />
      </section>

      <section className="mt-6">
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
                      {source.chunk_count} searchable sections · added {formatKnowledgeDate(source.created_at)}
                    </p>
                  </div>
                  <ArrowRight size={17} className="shrink-0 text-muted" />
                </Link>
              ))
            )}
          </div>
        </section>
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
              Add menus, policies, FAQs, or service notes Pronto should rely on.
            </p>
          </div>
        </div>
        <form action="/api/client/knowledge" method="post" encType="multipart/form-data" className="space-y-3 p-4">
          <input
            name="title"
            className="w-full rounded-md border border-line px-3 py-2 text-sm"
            placeholder="Source title, optional for uploads"
          />
          <textarea
            name="content"
            rows={8}
            className="w-full rounded-md border border-line px-3 py-2 text-sm"
            placeholder="Paste menu, policy, opening hours, FAQs, or service notes"
          />
          <KnowledgeFileInput />
          <PendingSubmitButton className="ui-primary-button px-4 py-2" pendingText="Adding...">
            Add source
          </PendingSubmitButton>
        </form>
      </section>
    </AppShell>
  );
}

function formatKnowledgeDate(value: Date | null): string {
  if (!value) {
    return "None";
  }
  return formatDisplayDate(value);
}
