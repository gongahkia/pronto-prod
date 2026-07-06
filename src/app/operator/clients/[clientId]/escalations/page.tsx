import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getClient, getOpenEscalations } from "@/lib/dashboard";
import { listClientStaff } from "@/lib/escalations-bulk";
import { AppShell } from "@/components/shell";
import {
  OperatorClientHeader,
  OperatorClientNav,
} from "@/components/operator/operator-nav";
import { BulkEscalationList } from "@/components/bulk-escalation-list";
import {
  PaginationControls,
  pageFromSearchParams,
} from "@/components/reporting-panels";

export default async function OperatorClientEscalationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ clientId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser("operator");
  const { clientId } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const page = pageFromSearchParams(resolvedSearchParams);
  const limit = 20;
  const [client, escalations, staff] = await Promise.all([
    getClient(clientId),
    getOpenEscalations({ clientId, limit: limit + 1, offset: (page - 1) * limit }),
    listClientStaff(clientId),
  ]);
  if (!client) {
    notFound();
  }

  const hasNext = escalations.length > limit;
  const visibleEscalations = escalations.slice(0, limit);

  return (
    <AppShell user={user} active="operator">
      <OperatorClientHeader
        client={client}
        description="Bulk-claim, assign, or resolve open escalations for this client."
      />
      <OperatorClientNav clientId={client.id} active="conversations" />

      <section className="ui-panel">
        <div className="ui-panel-header">
          <h2 className="text-base font-semibold">Open escalations</h2>
          <p className="text-sm text-muted">
            Multi-select rows to claim, assign to staff, or resolve in bulk.
          </p>
        </div>
        <div className="p-4">
          <BulkEscalationList
            clientId={client.id}
            escalations={visibleEscalations}
            staff={staff}
            allowAssign
            conversationHrefBase={`/operator/clients/${client.id}/conversations`}
          />
        </div>
        <PaginationControls
          action={`/operator/clients/${client.id}/escalations`}
          searchParams={resolvedSearchParams}
          page={page}
          hasNext={hasNext}
        />
      </section>
    </AppShell>
  );
}
