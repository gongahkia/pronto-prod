import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { channelKinds } from "@/lib/channels/catalog";
import { getChannels, getClient } from "@/lib/dashboard";
import { listChannelDrafts } from "@/lib/client-channel-drafts";
import { getChannelActivationSummary, channelEvidenceKinds } from "@/lib/managed-approvals";
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
  const drafts = await listChannelDrafts(client.id);
  const activation = await Promise.all(channels.map((channel) => getChannelActivationSummary(client.id, channel.id)));
  const requestedChannel = Array.isArray(query.channel) ? query.channel[0] : query.channel;
  const activeChannelKind = channelKinds.includes(requestedChannel as ChannelKind)
    ? (requestedChannel as ChannelKind)
    : undefined;

  return (
    <AppShell user={user} active="operator">
      <OperatorClientHeader
        client={client}
        description="Prepare customer channels, review approval evidence, and activate explicitly."
      />
      <OperatorClientNav clientId={client.id} active="channels" />
      <OperatorChannelSetup
        clientId={client.id}
        channels={channels}
        activeChannelKind={activeChannelKind}
      />
      <section className="ui-panel mt-5 p-4"><h2 className="font-semibold">Reviewed activation</h2>
        <p className="mb-3 text-sm text-muted">Business approval and revision-bound technical evidence are required. Local tests do not count as real provider delivery.</p>
        {channels.map((channel, index) => {
          const state = activation[index];
          const draft = drafts.find((item) => item.channel_id === channel.id);
          return <div className="border-t border-line py-4 text-sm" key={channel.id}>
            <strong>{channel.name}</strong> · {channel.status}{draft ? ` · proposed ${draft.status}` : ""}
            <p>Business approved: {state.approval ? "yes" : "pending"} · Evidence: {state.evidence.join(", ") || "none"}
              {draft ? ` · proposed health ${draft.health_status ?? "unchecked"}` : ""}</p>
            {state.revision && (channel.status !== "active" || draft) ? <>
              {draft ? <form action="/api/operator/channels/activation" method="post" className="mt-2">
                <input type="hidden" name="clientId" value={client.id}/><input type="hidden" name="channelId" value={channel.id}/>
                <button className="ui-button px-3 py-2" name="action" value="check_draft">Check proposed connection</button>
              </form> : null}
              <form action="/api/operator/channels/activation" method="post" className="mt-2 flex flex-wrap gap-2">
                <input type="hidden" name="clientId" value={client.id}/><input type="hidden" name="channelId" value={channel.id}/>
                <input type="hidden" name="revision" value={state.revision}/><input type="hidden" name="action" value="evidence"/>
                <select className="ui-input px-2 py-1" name="checkKind" aria-label={`Evidence type for ${channel.name}`}>
                  {channelEvidenceKinds.map((kind) => <option key={kind} value={kind}>{kind}</option>)}</select>
                <input className="ui-input px-2 py-1" name="details" required aria-label={`Evidence details for ${channel.name}`} placeholder="Test record and outcome"/>
                <button className="ui-button px-2 py-1">Record evidence</button>
              </form>
              <form action="/api/operator/channels/activation" method="post" className="mt-2">
                <input type="hidden" name="clientId" value={client.id}/><input type="hidden" name="channelId" value={channel.id}/>
                <input type="hidden" name="revision" value={state.revision}/>
                <button className="ui-primary-button px-3 py-2" name="action" value={draft ? "publish_draft" : "activate"}>
                  {draft?.status === "active" || !draft ? "Activate approved channel" : "Publish nonactive revision"}</button>
              </form>
            </> : null}
            {draft && channel.status === "active" ? <p className="mt-2 text-muted">This proposed edit leaves the live channel active until Pronto publishes its reviewed revision.</p> : null}
          </div>;
        })}
      </section>
    </AppShell>
  );
}
