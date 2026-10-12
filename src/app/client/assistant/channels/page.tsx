import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { channelDefinition, channelKinds } from "@/lib/channels/catalog";
import { decryptChannelCredentials } from "@/lib/channels/credentials";
import { channelSetupFields, listChannelDrafts } from "@/lib/client-channel-drafts";
import { getChannels, getClient } from "@/lib/dashboard";
import { appBaseUrl } from "@/lib/env";
import { AppShell } from "@/components/shell";
import { Badge } from "@/components/badge";
import { ClientAssistantNav } from "@/components/client-assistant-nav";

type Search = { channel?: string; saved?: string; checked?: string; published?: string; error?: string };

export default async function ClientChannelsPage({ searchParams }: { searchParams?: Promise<Search> }) {
  const user = await requireUser("client");
  if (!user.clientId) throw new Error("Client user is missing a client assignment.");
  const [client, channels, drafts, params] = await Promise.all([
    getClient(user.clientId),
    getChannels(user.clientId),
    listChannelDrafts(user.clientId),
    searchParams ?? Promise.resolve({} as Search),
  ]);
  if (!client) throw new Error("Client record not found.");
  const selected = channels.find((channel) => channel.id === params.channel) ?? channels[0];
  const draft = drafts.find((item) => item.channel_id === selected?.id);
  const exposedDraft = draft ? decryptChannelCredentials({ ...draft, credentials: {} }) : null;
  const currentCredentials: Record<string, unknown> = exposedDraft?.credentials ?? selected?.credentials ?? {};
  const currentSettings: Record<string, unknown> = exposedDraft?.settings ?? selected?.settings ?? {};

  return (
    <AppShell user={user} active="client" clientActive="assistant" workspaceName={client.name}>
      <div className="mb-5">
        <h1 className="text-xl font-semibold">Channels</h1>
        <p className="text-sm text-muted">Connect and verify where customers message your business.</p>
      </div>
      <ClientAssistantNav active="channels" />
      <div className="grid items-start gap-5 lg:grid-cols-[17rem_minmax(0,1fr)]">
        <aside className="space-y-4">
          <section className="ui-panel">
            <div className="ui-panel-header"><h2 className="font-semibold">Your channels</h2></div>
            <div className="divide-y divide-line">
              {channels.length === 0 ? <p className="p-4 text-sm text-muted">No channels connected yet.</p> : null}
              {channels.map((channel) => {
                const pending = drafts.some((item) => item.channel_id === channel.id);
                return (
                  <Link key={channel.id} href={"/client/assistant/channels?channel=" + channel.id}
                    aria-current={channel.id === selected?.id ? "page" : undefined}
                    className={"flex items-center justify-between gap-2 p-4 text-sm hover:bg-surface-hover " + (channel.id === selected?.id ? "bg-surface" : "")}>
                    <span className="min-w-0 truncate">{channel.name}</span>
                    <Badge tone={pending ? "amber" : channel.status === "active" ? "green" : "neutral"}>
                      {pending ? "Draft" : channel.status}
                    </Badge>
                  </Link>
                );
              })}
            </div>
          </section>
          <form action="/api/client/channels" method="post" className="ui-panel space-y-3 p-4">
            <h2 className="font-semibold">Add a channel</h2>
            <label className="block text-sm">Platform
              <select name="kind" className="ui-input mt-1 w-full px-3 py-2">
                {channelKinds.map((kind) => (
                  <option key={kind} value={kind}>{channelDefinition(kind).label}</option>
                ))}
              </select>
            </label>
            <label className="block text-sm">Name
              <input name="name" required maxLength={80} className="ui-input mt-1 w-full px-3 py-2"
                placeholder="Customer support" />
            </label>
            <button className="ui-button px-3 py-2">Add channel</button>
          </form>
        </aside>
        <div>
          {params.error ? <p role="alert" className="mb-4 rounded-md bg-danger-bg p-3 text-sm text-danger">{params.error}</p> : null}
          {params.saved ? <p role="status" className="mb-4 rounded-md bg-success-bg p-3 text-sm text-success">Settings saved as a draft. Check the connection next.</p> : null}
          {params.checked ? <p role="status" className="mb-4 rounded-md bg-surface p-3 text-sm">Check result: {params.checked}.</p> : null}
          {params.published ? <p role="status" className="mb-4 rounded-md bg-success-bg p-3 text-sm text-success">Channel changes are live.</p> : null}
          {selected ? (
            <section className="ui-panel">
              <div className="ui-panel-header">
                <h2 className="font-semibold">{selected.name} · {channelDefinition(selected.kind).label}</h2>
                <p className="text-sm text-muted">Save details, check the connection, then publish.</p>
              </div>
              <form action={"/api/client/channels/" + selected.id} method="post" className="space-y-4 p-4">
                <input type="hidden" name="action" value="save" />
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="text-sm font-medium">Desired status
                    <select name="status" defaultValue={draft?.status ?? selected.status}
                      className="ui-input mt-1 w-full px-3 py-2">
                      <option value="draft">Draft</option>
                      <option value="active">Active</option>
                      <option value="disabled">Disabled</option>
                    </select>
                  </label>
                  <label className="text-sm font-medium">External ID (if provided by platform)
                    <input name="externalId" defaultValue={draft?.external_id ?? selected.external_id ?? ""}
                      className="ui-input mt-1 w-full px-3 py-2" />
                  </label>
                  {channelSetupFields[selected.kind].map((field) => {
                    const igMode = currentSettings.authMode === "instagram_login" ? "instagram_login" : "facebook_login";
                    if (selected.kind === "instagram" &&
                        ((igMode === "instagram_login" && ["pageAccessToken", "pageId"].includes(field.name)) ||
                         (igMode === "facebook_login" && ["instagramAccessToken", "tokenExpiresAt"].includes(field.name)))) return null;
                    const source = field.scope === "settings" ? currentSettings : currentCredentials;
                    const stored = Boolean(source[field.name]);
                    return (
                      <label key={field.scope + "." + field.name} className="text-sm font-medium">
                        {field.label}
                        {field.options ? <select name={field.scope + "." + field.name}
                          defaultValue={String(source[field.name] ?? field.options[0])}
                          className="ui-input mt-1 w-full px-3 py-2">
                          {field.options.map((option) => <option key={option} value={option}>{option}</option>)}
                        </select> : <input name={field.scope + "." + field.name}
                          type={field.secret ? "password" : "text"}
                          autoComplete="off"
                          defaultValue={field.secret ? "" : String(source[field.name] ?? "")}
                          placeholder={field.secret && stored ? "Saved securely · leave blank to keep" : ""}
                          className="ui-input mt-1 w-full px-3 py-2" />}
                      </label>
                    );
                  })}
                </div>
                <button className="ui-primary-button px-4 py-2">Save draft settings</button>
              </form>
              {selected.kind === "instagram" ? <div className="border-t border-line p-4 text-sm">
                <p>Instagram Login uses a professional account directly; Facebook Login keeps the linked Page path.</p>
                <form action={"/api/client/channels/" + selected.id + "/instagram-login"} method="post" className="mt-3">
                  <button className="ui-button px-4 py-2">Connect with Instagram Login</button>
                </form>
                <p className="mt-2 text-muted">Requires configured Meta app credentials and an authorized professional test account. Connection remains a draft until checked and published.</p>
              </div> : null}
              <div className="space-y-4 border-t border-line p-4">
                <div className="rounded-md bg-surface p-3 text-sm">
                  <p className="font-medium">Webhook URL</p>
                  <code className="mt-1 block break-all text-xs">
                    {appBaseUrl() + "/api/webhooks/" + selected.kind + "/" + selected.id}
                  </code>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <form action={"/api/client/channels/" + selected.id} method="post">
                    <input type="hidden" name="action" value="check" />
                    <button disabled={!draft} className="ui-button px-4 py-2">Check connection</button>
                  </form>
                  {draft ? <span className="text-sm text-muted">Pronto publishes after business approval and technical review.</span> : null}
                  {draft ? <Badge tone={draft.health_status === "healthy" ? "green" : "amber"}>
                    {draft.health_status ?? "Not checked"}
                  </Badge> : null}
                </div>
                {draft?.health_detail ? <p className="text-sm text-muted">{draft.health_detail}</p> : null}
              </div>
            </section>
          ) : null}
        </div>
      </div>
    </AppShell>
  );
}
