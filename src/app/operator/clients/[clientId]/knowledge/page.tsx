import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getClient, getKnowledgeSources } from "@/lib/dashboard";
import { AppShell } from "@/components/shell";
import {
  OperatorClientHeader,
  OperatorClientNav,
} from "@/components/operator/operator-nav";
import {
  OperatorKnowledgeIngestion,
  OperatorKnowledgeSources,
} from "@/components/operator/operator-panels";

export const dynamic = "force-dynamic";

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

  const knowledge = await getKnowledgeSources(client.id);

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
    </AppShell>
  );
}
