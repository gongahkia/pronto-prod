import { requireUser } from "@/lib/auth";
import { getClient } from "@/lib/dashboard";
import { getTriageFlowForClient } from "@/lib/triage-flow-store";
import { AppShell } from "@/components/shell";
import { TriageFlowEditor } from "@/components/triage-flow-editor";

export const dynamic = "force-dynamic";

export default async function ClientFlowsPage() {
  const user = await requireUser("client");
  if (!user.clientId) {
    throw new Error("Client user is missing a client assignment.");
  }

  const [client, flow] = await Promise.all([
    getClient(user.clientId),
    getTriageFlowForClient(user.clientId),
  ]);
  if (!client) {
    throw new Error("Client record not found.");
  }

  return (
    <AppShell user={user} active="client" clientActive="flows" workspaceName={client.name}>
      <div className="mb-5">
        <h1 className="text-xl font-semibold tracking-[-0.01em]">{client.name}</h1>
        <p className="text-sm text-muted">
          Configure channel intake and customer triage guardrails.
        </p>
      </div>
      <TriageFlowEditor
        initialNodes={flow.nodes}
        initialEdges={flow.edges}
        initialCompiledRules={flow.compiledEscalationRules}
        saveUrl="/api/client/flows"
        version={flow.version}
        isDefault={flow.isDefault}
      />
    </AppShell>
  );
}
