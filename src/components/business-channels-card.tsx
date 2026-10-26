import Image from "next/image";
import Link from "next/link";
import { ChevronDown, MessageCircle, Plus, Settings2 } from "lucide-react";
import { Badge } from "@/components/badge";
import { channelDefinition, channelDefinitions } from "@/lib/channels/catalog";
import { decryptChannelCredentials } from "@/lib/channels/credentials";
import { channelSetupFields, type ChannelDraft } from "@/lib/client-channel-drafts";
import { appBaseUrl } from "@/lib/env";
import type { Channel } from "@/lib/types";

export type KnowledgeChannelParams = { channel?: string; saved?: string; checked?: string; channelPublished?: string; channelError?: string };
export function BusinessChannelsCard({ channels, drafts, params }: {
  channels: Channel[]; drafts: ChannelDraft[]; params: KnowledgeChannelParams;
}) {
  const selected = channels.find(channel => channel.id === params.channel) ?? channels.find(channel => channel.kind !== "console") ?? channels[0];
  const draft = drafts.find(item => item.channel_id === selected?.id);
  const exposed = draft ? decryptChannelCredentials({ ...draft, credentials: {} }) : null;
  const settings: Record<string, unknown> = exposed?.settings ?? selected?.settings ?? {};
  const credentials: Record<string, unknown> = exposed?.credentials ?? selected?.credentials ?? {};
  const configuredCount = channels.filter(channel => channel.status === "active").length;
  return <section id="channels" className="ui-panel scroll-mt-6 overflow-hidden" aria-labelledby="channels-heading">
    <div className="p-5"><div className="flex items-center gap-3"><MessageCircle size={20} className="text-accent" aria-hidden="true"/><h2 id="channels-heading" className="text-lg font-semibold">Channels</h2>
      <span className="ml-auto text-xs text-muted">{configuredCount} active</span></div>
      <p className="mt-2 text-sm text-muted">Where customers can reach your business.</p>
    </div>
    {channels.length ? <ul className="divide-y divide-line border-t border-line">{channels.map(channel => {
      const pending = drafts.some(item => item.channel_id === channel.id);
      const label = channel.kind === "console" ? "Customer chat" : channel.name.replace(/^Demo\s+/i, "").replace(/\s*\(draft\)$/i, "");
      return <li key={channel.id}><Link href={`/client/knowledge?channel=${encodeURIComponent(channel.id)}#channels`}
        className="flex items-center gap-3 px-5 py-3 text-sm hover:bg-surface-hover">
        <Image src={channelDefinition(channel.kind).iconPath} alt="" width={20} height={20}/>
        <span className="min-w-0 flex-1"><span className="block truncate">{label}</span>
          {channel.kind !== "console" && label !== channelDefinition(channel.kind).label && <span className="mt-0.5 block text-xs text-muted">{channelDefinition(channel.kind).label}</span>}</span>
        <Badge tone={pending ? "amber" : channel.status === "active" ? "green" : "neutral"}>{pending ? "Draft changes" : channel.status === "active" ? "Active" : channel.status === "draft" ? "Setup needed" : "Disabled"}</Badge>
      </Link></li>;
    })}</ul> : <p className="px-5 pb-5 text-sm text-muted">No customer channels added.</p>}
    <details key={selected?.id} className="group border-t border-line" open={Boolean(params.channel)}>
      <summary className="flex cursor-pointer list-none items-center gap-2 px-5 py-4 text-sm font-medium [&::-webkit-details-marker]:hidden">
        <Settings2 size={17} aria-hidden="true"/>Manage connections<ChevronDown size={16} className="ml-auto transition-transform group-open:rotate-180" aria-hidden="true"/>
      </summary>
      <div className="space-y-4 px-5 pb-5">
        {params.channelError && <p role="alert" className="rounded-md bg-danger-bg p-3 text-sm text-danger">{params.channelError}</p>}
        {params.saved && <p role="status" className="text-sm text-success">Connection settings saved as a draft.</p>}
        {params.checked && <p role="status" className="text-sm text-muted">Connection check: {params.checked}.</p>}
        {params.channelPublished && <p role="status" className="text-sm text-success">Channel changes are live.</p>}
        {selected && <div>
          <h3 className="mb-3 font-medium">{selected.kind === "console" ? "Customer chat" : selected.name}</h3>
          <form key={selected.id} action={`/api/client/channels/${selected.id}`} method="post" className="space-y-3">
            <input type="hidden" name="action" value="save"/>
            <label className="block text-sm">Desired status<select name="status" defaultValue={draft?.status ?? selected.status} className="ui-input mt-1 w-full px-3 py-2">
              <option value="draft">Draft</option><option value="active">Active</option><option value="disabled">Disabled</option>
            </select></label>
            <label className="block text-sm">External ID<input name="externalId" defaultValue={draft?.external_id ?? selected.external_id ?? ""} className="ui-input mt-1 w-full px-3 py-2"/></label>
            {channelSetupFields[selected.kind].map(field => {
              const igMode = settings.authMode === "instagram_login" ? "instagram_login" : "facebook_login";
              if (selected.kind === "instagram" && ((igMode === "instagram_login" && ["pageAccessToken", "pageId"].includes(field.name)) ||
                (igMode === "facebook_login" && ["instagramAccessToken", "tokenExpiresAt"].includes(field.name)))) return null;
              const source = field.scope === "settings" ? settings : credentials;
              return <label key={`${field.scope}.${field.name}`} className="block text-sm">{field.label}
                {field.options ? <select name={`${field.scope}.${field.name}`} defaultValue={String(source[field.name] ?? field.options[0])} className="ui-input mt-1 w-full px-3 py-2">
                  {field.options.map(option => <option key={option} value={option}>{option}</option>)}</select>
                  : <input name={`${field.scope}.${field.name}`} type={field.secret ? "password" : "text"} autoComplete="off"
                    defaultValue={field.secret ? "" : String(source[field.name] ?? "")} placeholder={field.secret && source[field.name] ? "Saved securely · leave blank to keep" : ""}
                    className="ui-input mt-1 w-full px-3 py-2"/>}
              </label>;
            })}
            <button className="ui-primary-button px-4 py-2 text-sm">Save draft settings</button>
          </form>
          {selected.kind === "instagram" && <form action={`/api/client/channels/${selected.id}/instagram-login`} method="post" className="mt-3">
            <button className="ui-button px-3 py-2 text-sm">Connect with Instagram Login</button></form>}
          <details className="my-4 text-sm"><summary className="cursor-pointer text-muted">Webhook details</summary>
            <code className="mt-2 block break-all text-xs">{`${appBaseUrl()}/api/webhooks/${selected.kind}/${selected.id}`}</code></details>
          <div className="flex flex-wrap items-center gap-2"><form action={`/api/client/channels/${selected.id}`} method="post">
            <input type="hidden" name="action" value="check"/><button disabled={!draft} className="ui-button px-3 py-2 text-sm">Check connection</button></form>
            {draft && <Badge tone={draft.health_status === "healthy" ? "green" : "amber"}>{draft.health_status ?? "Not checked"}</Badge>}</div>
          {draft?.health_detail && <p className="mt-2 text-sm text-muted">{draft.health_detail}</p>}
          <p className="mt-3 text-xs leading-5 text-muted">Connection changes need business approval and Pronto activation.</p>
        </div>}
        <details className="border-t border-line pt-3"><summary className="flex cursor-pointer items-center gap-2 text-sm font-medium"><Plus size={16} aria-hidden="true"/>Add a channel</summary>
          <form action="/api/client/channels" method="post" className="mt-3 space-y-3">
            <label className="block text-sm">Platform<select name="kind" className="ui-input mt-1 w-full px-3 py-2">
              {channelDefinitions.map(channel => <option key={channel.kind} value={channel.kind}>{channel.label}</option>)}</select></label>
            <label className="block text-sm">Name<input name="name" required maxLength={80} className="ui-input mt-1 w-full px-3 py-2" placeholder="Customer support"/></label>
            <button className="ui-button px-3 py-2 text-sm">Add channel</button>
          </form>
        </details>
      </div>
    </details>
  </section>;
}
