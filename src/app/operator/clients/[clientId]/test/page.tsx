import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getClient } from "@/lib/dashboard";
import { AppShell } from "@/components/shell";
import {
  OperatorClientHeader,
  OperatorClientNav,
} from "@/components/operator/operator-nav";
import { PilotConsole } from "@/components/pilot-console";

export default async function OperatorClientTestPage({
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

  return (
    <AppShell user={user} active="operator">
      <OperatorClientHeader
        client={client}
        description="Stress-test the assistant without sending live channel traffic."
      />
      <OperatorClientNav clientId={client.id} active="test" />
      <PilotConsole clientId={client.id} />
    </AppShell>
  );
}
