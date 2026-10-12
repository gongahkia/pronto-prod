import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { ConversationList, PaginationControls, pageFromSearchParams } from "@/components/reporting-panels";
import { AppShell } from "@/components/shell";
import { channelDefinitions } from "@/lib/channels/catalog";
import { getFilteredConversations } from "@/lib/reporting";

export default async function OperatorConversationsPage({ searchParams }: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser("operator");
  const params = await searchParams ?? {};
  const value = (key: string) => typeof params[key] === "string" ? params[key] as string : "";
  const page = pageFromSearchParams(params);
  const limit = 50;
  const filters = {
    businessSearch: value("business"), query: value("q"), channelKind: value("channel"),
    status: value("status"), escalationStatus: value("escalation"),
    assignedSearch: value("assigned"), deliveryFailure: value("delivery") === "failed",
  };
  const rows = await getFilteredConversations({ ...filters, sort: "attention", limit: limit + 1,
    offset: (page - 1) * limit });
  const hasNext = rows.length > limit;
  return <AppShell user={user} active="operator" operatorActive="inbox">
    <div className="mb-5"><h1 className="text-xl font-semibold">Inbox</h1>
      <p className="text-sm text-muted">Find customer conversations across businesses and respond to handoffs.</p></div>
    <section className="ui-panel">
      <form action="/operator/conversations" className="grid gap-3 p-4 md:grid-cols-3 xl:grid-cols-4">
        <input className="ui-input px-3 py-2" name="business" aria-label="Business" placeholder="Business" defaultValue={filters.businessSearch} />
        <input className="ui-input px-3 py-2" name="q" aria-label="Customer or message" placeholder="Customer or message" defaultValue={filters.query} />
        <select className="ui-input px-3 py-2" name="channel" aria-label="Channel" defaultValue={filters.channelKind}>
          <option value="">All channels</option>{channelDefinitions.map((item) => <option key={item.kind} value={item.kind}>{item.label}</option>)}
        </select>
        <select className="ui-input px-3 py-2" name="status" aria-label="Conversation ownership" defaultValue={filters.status}>
          <option value="">Any ownership</option><option value="active">AI-owned</option>
          <option value="escalated">Human-owned</option><option value="closed">Closed</option>
        </select>
        <select className="ui-input px-3 py-2" name="escalation" aria-label="Escalation state" defaultValue={filters.escalationStatus}>
          <option value="">Any handoff</option><option value="open">Open</option><option value="claimed">Claimed</option>
        </select>
        <input className="ui-input px-3 py-2" name="assigned" aria-label="Assigned staff" placeholder="Assigned staff" defaultValue={filters.assignedSearch} />
        <select className="ui-input px-3 py-2" name="delivery" aria-label="Delivery state" defaultValue={value("delivery")}>
          <option value="">Any delivery</option><option value="failed">Failed or uncertain</option>
        </select>
        <div className="flex gap-2"><button className="ui-primary-button px-3 py-2">Filter</button>
          <Link href="/operator/conversations" className="ui-button px-3 py-2">Reset</Link></div>
      </form>
      <ConversationList conversations={rows.slice(0, limit)} showClient
        hrefForConversation={(row) => `/operator/clients/${row.client_id}/conversations/${row.id}`} />
      <PaginationControls action="/operator/conversations" searchParams={params} page={page} hasNext={hasNext} />
    </section>
  </AppShell>;
}
