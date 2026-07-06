import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getOpenEscalations } from "@/lib/dashboard";
import { AppShell } from "@/components/shell";
import { BulkEscalationList } from "@/components/bulk-escalation-list";
import {
  PaginationControls,
  pageFromSearchParams,
} from "@/components/reporting-panels";

export default async function ClientEscalationsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser("client");
  if (!user.clientId) {
    notFound();
  }
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const page = pageFromSearchParams(resolvedSearchParams);
  const limit = 20;
  const escalations = await getOpenEscalations({
    clientId: user.clientId,
    limit: limit + 1,
    offset: (page - 1) * limit,
  });
  const hasNext = escalations.length > limit;
  const visibleEscalations = escalations.slice(0, limit);

  return (
    <AppShell user={user} active="client">
      <div className="mb-5">
        <h1 className="text-xl font-semibold">Escalations</h1>
        <p className="text-sm text-muted">
          Open items that need a human reply.
        </p>
      </div>

      <section className="ui-panel">
        <div className="ui-panel-header">
          <h2 className="text-base font-semibold">Open escalations</h2>
        </div>
        <div className="p-4">
          <BulkEscalationList
            clientId={user.clientId}
            escalations={visibleEscalations}
            simple
            hrefForConversation={(_, conversationId) =>
              `/client/conversations/${conversationId}`
            }
          />
        </div>
        <PaginationControls
          action="/client/escalations"
          searchParams={resolvedSearchParams}
          page={page}
          hasNext={hasNext}
        />
      </section>
    </AppShell>
  );
}
