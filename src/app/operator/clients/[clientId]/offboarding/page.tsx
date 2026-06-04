import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getClient } from "@/lib/dashboard";
import { AppShell } from "@/components/shell";
import {
  OperatorClientHeader,
  OperatorClientNav,
} from "@/components/operator/operator-nav";
import { OperatorOffboardingPanel } from "@/components/operator/operator-panels";

export const dynamic = "force-dynamic";

export default async function OperatorClientOffboardingPage({
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
        description="Export or delete client data when a pilot ends."
      />
      <OperatorClientNav clientId={client.id} active="offboarding" />
      <OperatorOffboardingPanel client={client} />
    </AppShell>
  );
}
