import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getClient, getOpenEscalations } from "@/lib/dashboard";
import { AppShell } from "@/components/shell";
import {
  OperatorClientHeader,
  OperatorClientNav,
} from "@/components/operator/operator-nav";
import { OperatorEscalationList } from "@/components/operator/operator-panels";

export const dynamic = "force-dynamic";

export default async function OperatorClientEscalationsPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const user = await requireUser("operator");
  const { clientId } = await params;
  const client = await getClient(clientId);
  if (!client) {
    notFound();
  }

  const escalations = await getOpenEscalations(client.id);

  return (
    <AppShell user={user} active="operator">
      <OperatorClientHeader
        client={client}
        description="Claim, reply, and resolve escalations for this client."
      />
      <OperatorClientNav clientId={client.id} active="escalations" />

      <section className="ui-panel">
        <div className="ui-panel-header">
          <h2 className="text-base font-semibold">Active escalations</h2>
        </div>
        <OperatorEscalationList
          escalations={escalations}
          showClient={false}
          returnTo={(escalation) => `/operator/clients/${client.id}/escalations#escalation-${escalation.id}`}
        />
      </section>
    </AppShell>
  );
}
