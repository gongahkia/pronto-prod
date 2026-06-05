import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getClient } from "@/lib/dashboard";
import { getTriageFlowForClient } from "@/lib/triage-flow-store";
import { AppShell } from "@/components/shell";
import {
  OperatorClientHeader,
  OperatorClientNav,
} from "@/components/operator/operator-nav";
import { TriageFlowEditor } from "@/components/triage-flow-editor";

export const dynamic = "force-dynamic";

export default async function OperatorClientFlowsPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const user = await requireUser("operator");
  const { clientId } = await params;
  const [client, flow] = await Promise.all([
    getClient(clientId),
    getTriageFlowForClient(clientId),
  ]);
  if (!client) {
    notFound();
  }

  return (
    <AppShell user={user} active="operator">
      <OperatorClientHeader
        client={client}
        description="Configure channel intake and runtime triage guardrails for this client."
      />
      <OperatorClientNav clientId={client.id} active="flows" />

      <TriageFlowEditor
        initialNodes={flow.nodes}
        initialEdges={flow.edges}
        initialCompiledRules={flow.compiledEscalationRules}
        saveUrl="/api/operator/flows"
        clientId={client.id}
        version={flow.version}
        isDefault={flow.isDefault}
      />
    </AppShell>
  );
}
