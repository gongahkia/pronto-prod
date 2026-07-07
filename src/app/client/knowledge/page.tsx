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

type KnowledgeTab = "sources" | "refresh" | "add";

export default async function ClientKnowledgePage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser("client");
  if (!user.clientId) {
    throw new Error("Client user is missing a client assignment.");
  }
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const activeTab = knowledgeTabFromSearchParams(resolvedSearchParams);

  const [client, knowledge, refreshRequests] = await Promise.all([
    getClient(user.clientId),
    getKnowledgeSources(user.clientId),
    getKnowledgeRefreshRequests(user.clientId),
  ]);
  if (!client) {
    throw new Error("Client record not found.");
  }

  const openRefreshes = refreshRequests.filter((request) => request.status === "open");

  return (
    <AppShell user={user} active="client" clientActive="knowledge" workspaceName={client.name}>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Knowledge</h1>
          <p className="text-sm text-muted">
            What Pronto knows about your business, and what needs updating.
          </p>
        </div>
        <nav aria-label="Knowledge sections" className="flex gap-2 overflow-x-auto">
          <KnowledgeTabLink tab="sources" activeTab={activeTab} label="Sources" count={knowledge.length} />
          <KnowledgeTabLink tab="refresh" activeTab={activeTab} label="Refresh" count={openRefreshes.length} />
          <KnowledgeTabLink tab="add" activeTab={activeTab} label="Add source" />
        </nav>
      </div>

      {activeTab === "sources" ? (
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
      ) : null}

      {activeTab === "refresh" ? (
        <KnowledgeRefreshPanel
          requests={refreshRequests}
          action="/api/client/knowledge-refresh"
        />
      ) : null}

      {activeTab === "add" ? (
      <section className="ui-panel">
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
      ) : null}
    </AppShell>
  );
}

function KnowledgeTabLink({
  tab,
  activeTab,
  label,
  count,
}: {
  tab: KnowledgeTab;
  activeTab: KnowledgeTab;
  label: string;
  count?: number;
}) {
  const active = tab === activeTab;
  return (
    <Link
      href={`/client/knowledge?tab=${tab}`}
      aria-current={active ? "page" : undefined}
      className={`inline-flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm font-medium ${
        active
          ? "bg-accent text-white"
          : "border border-line bg-surface text-muted hover:bg-surface-hover hover:text-foreground"
      }`}
    >
      {label}
      {count !== undefined ? (
        <span className={`rounded-full px-2 py-0.5 text-xs ${active ? "bg-white/20 text-white" : "bg-panel text-muted"}`}>
          {count}
        </span>
      ) : null}
    </Link>
  );
}

function knowledgeTabFromSearchParams(
  searchParams: Record<string, string | string[] | undefined>,
): KnowledgeTab {
  const value = Array.isArray(searchParams.tab) ? searchParams.tab[0] : searchParams.tab;
  if (value === "refresh" || value === "add") {
    return value;
  }
  return "sources";
}

function formatKnowledgeDate(value: Date | null): string {
  if (!value) {
    return "None";
  }
  return formatDisplayDate(value);
}
