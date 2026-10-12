import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getClient } from "@/lib/dashboard";
import { getTriageFlowForClient } from "@/lib/triage-flow-store";
import { getAssistantDraft, stageFlow } from "@/lib/assistant-drafts";
import { AppShell } from "@/components/shell";
import {
  OperatorClientHeader,
  OperatorClientNav,
} from "@/components/operator/operator-nav";
import { TriageFlowJsonEditor } from "@/components/triage-flow-json-editor";

export default async function OperatorFlowsPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const user = await requireUser("operator");
  const { clientId } = await params;
  const [client, flow, draft] = await Promise.all([
    getClient(clientId),
    getTriageFlowForClient(clientId),
    getAssistantDraft(clientId),
  ]);
  if (!client) {
    notFound();
  }
  const initialValue = JSON.stringify(
    draft?.flow ?? { nodes: flow.nodes, edges: flow.edges },
    null,
    2,
  );

  async function save(json: string) {
    "use server";
    const parsed = JSON.parse(json) as { nodes?: unknown; edges?: unknown };
    await stageFlow({
      clientId,
      actorUserId: user.userId,
      nodes: parsed.nodes,
      edges: parsed.edges,
    });
  }

  return (
    <AppShell user={user} active="operator">
      <OperatorClientHeader
        client={client}
        description="Edit the raw smart-triage JSON that compiles into escalation rules."
      />
      <OperatorClientNav clientId={client.id} active="flows" />
      <section className="ui-panel">
        <div className="ui-panel-header">
          <div>
            <h2 className="text-base font-semibold">Triage flow draft</h2>
            <p className="text-sm text-muted">
              Schema: {"{ nodes: [...], edges: [...] }"}.
            </p>
          </div>
        </div>
        <div className="p-4">
          <TriageFlowJsonEditor initialValue={initialValue} saveAction={save} />
        </div>
      </section>
    </AppShell>
  );
}
