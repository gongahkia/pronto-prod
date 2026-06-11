import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getClient, getKnowledgeSources } from "@/lib/dashboard";
import { getKnowledgeRefreshRequests } from "@/lib/knowledge/refresh";
import { AppShell } from "@/components/shell";
import { KnowledgeRefreshPanel } from "@/components/knowledge-refresh-panel";
import {
  OperatorClientHeader,
  OperatorClientNav,
} from "@/components/operator/operator-nav";
import {
  OperatorKnowledgeIngestion,
  OperatorKnowledgeSources,
} from "@/components/operator/operator-panels";

export default async function OperatorClientKnowledgePage({
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

  const [knowledge, refreshRequests] = await Promise.all([
    getKnowledgeSources(client.id),
    getKnowledgeRefreshRequests(client.id),
  ]);

  return (
    <AppShell user={user} active="operator">
      <OperatorClientHeader
        client={client}
        description="Add and inspect the sources that ground this client's assistant."
      />
      <OperatorClientNav clientId={client.id} active="knowledge" />

      <section className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <OperatorKnowledgeIngestion clientId={client.id} />
        <OperatorKnowledgeSources clientId={client.id} sources={knowledge} />
      </section>

      <div className="mt-6">
        <KnowledgeRefreshPanel
          requests={refreshRequests}
          action="/api/operator/knowledge-refresh"
          clientId={client.id}
        />
      </div>
    </AppShell>
  );
}
