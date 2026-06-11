import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getChannels, getClient } from "@/lib/dashboard";
import { AppShell } from "@/components/shell";
import {
  OperatorClientHeader,
  OperatorClientNav,
} from "@/components/operator/operator-nav";
import { OperatorChannelSetup } from "@/components/operator/operator-panels";

export default async function OperatorClientChannelsPage({
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

  const channels = await getChannels(client.id);

  return (
    <AppShell user={user} active="operator">
      <OperatorClientHeader
        client={client}
        description="Configure live channels, webhook URLs, credentials, and health checks."
      />
      <OperatorClientNav clientId={client.id} active="channels" />
      <OperatorChannelSetup clientId={client.id} channels={channels} />
    </AppShell>
  );
}
