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

export const dynamic = "force-dynamic";

export default async function OperatorClientEscalationsPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const user = await requireUser("operator");
  const { clientId } = await params;
  const [client, escalations, staff] = await Promise.all([
    getClient(clientId),
    getOpenEscalations(clientId),
    listClientStaff(clientId),
  ]);
  if (!client) {
    notFound();
  }

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
            escalations={escalations}
            staff={staff}
            allowAssign
            hrefForConversation={(_, conversationId) =>
              `/operator/clients/${client.id}/conversations/${conversationId}`
            }
          />
        </div>
      </section>
    </AppShell>
  );
}
