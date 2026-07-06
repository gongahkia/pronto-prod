import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getClient } from "@/lib/dashboard";
import {
  getTriageFlowForClient,
  saveTriageFlowForClient,
} from "@/lib/triage-flow-store";
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
  const [client, flow] = await Promise.all([
    getClient(clientId),
    getTriageFlowForClient(clientId),
  ]);
  if (!client) {
    notFound();
  }
  const initialValue = JSON.stringify(
    { nodes: flow.nodes, edges: flow.edges },
    null,
    2,
  );

  async function save(json: string) {
    "use server";
    const parsed = JSON.parse(json) as { nodes?: unknown; edges?: unknown };
    const saved = await saveTriageFlowForClient({
      clientId,
      actorUserId: user.userId,
      nodes: parsed.nodes,
      edges: parsed.edges,
      source: "operator",
    });
    if (!saved) {
      throw new Error("Agent config not found.");
    }
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
            <h2 className="text-base font-semibold">Triage flow JSON</h2>
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
