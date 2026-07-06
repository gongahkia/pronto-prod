import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { channelKinds } from "@/lib/channels/catalog";
import { getChannels, getClient } from "@/lib/dashboard";
import type { ChannelKind } from "@/lib/types";
import { AppShell } from "@/components/shell";
import {
  OperatorClientHeader,
  OperatorClientNav,
} from "@/components/operator/operator-nav";
import { OperatorChannelSetup } from "@/components/operator/operator-panels";

export default async function OperatorClientChannelsPage({
  params,
  searchParams,
}: {
  params: Promise<{ clientId: string }>;
  searchParams: Promise<{ channel?: string | string[] }>;
}) {
  const user = await requireUser("operator");
  const [{ clientId }, query] = await Promise.all([params, searchParams]);
  const client = await getClient(clientId);
  if (!client) {
    notFound();
  }

  const channels = await getChannels(client.id);
  const requestedChannel = Array.isArray(query.channel) ? query.channel[0] : query.channel;
  const activeChannelKind = channelKinds.includes(requestedChannel as ChannelKind)
    ? (requestedChannel as ChannelKind)
    : undefined;

  return (
    <AppShell user={user} active="operator">
      <OperatorClientHeader
        client={client}
        description="Configure live channels, webhook URLs, credentials, and health checks."
      />
      <OperatorClientNav clientId={client.id} active="channels" />
      <OperatorChannelSetup
        clientId={client.id}
        channels={channels}
        activeChannelKind={activeChannelKind}
      />
    </AppShell>
  );
}
