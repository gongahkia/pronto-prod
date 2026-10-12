import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getClient } from "@/lib/dashboard";
import { getBusinessChannelOverview } from "@/lib/business-portal";
import { listStaffDestinations } from "@/lib/staff-configuration";
import { hasStaffCapability } from "@/lib/staff-permissions";
import { localStaffCommandsEnabled } from "@/lib/staff-interaction";
import { AppShell } from "@/components/shell";
import { Badge } from "@/components/badge";

export default async function ClientChannelsPage() {
  const user = await requireUser("client");
  if (!user.clientId) throw new Error("Business assignment required.");
  const [client, channels, contacts, canApprove, canManageContacts] = await Promise.all([
    getClient(user.clientId), getBusinessChannelOverview(user.clientId), listStaffDestinations(user.clientId),
    hasStaffCapability(user, user.clientId, "channel.activate"),
    hasStaffCapability(user, user.clientId, "staff.permissions.manage"),
  ]);
  if (!client) throw new Error("Business not found.");
  return <AppShell user={user} active="client" clientActive="channels" workspaceName={client.name}>
    <h1 className="text-2xl font-semibold">Connected Channels</h1>
    <p className="mb-5 mt-1 text-sm text-muted">How customers reach your business and how your team hears from Pronto.</p>
    <section className="ui-panel"><div className="ui-panel-header"><h2 className="font-semibold">Customer enquiries</h2>
      <p className="text-sm text-muted">Pronto completes technical setup. Your approval alone does not turn on a channel.</p></div>
      {channels.length === 0 ? <p className="p-4 text-sm text-muted">No customer channel is configured yet. Pronto will coordinate setup with your team.</p>
        : <ul className="divide-y divide-line">{channels.map((channel) => <li key={channel.id} className="flex flex-wrap items-center justify-between gap-2 p-4">
          <div><p className="font-medium">{channel.name}</p><p className="text-sm text-muted">{channel.kind} · {
            !channel.has_secure_configuration ? "Secure setup needed" : channel.last_health_status === "degraded" ?
              "Connection needs Pronto review" : channel.status === "active" ? "Connected" :
                channel.status === "disabled" ? "Paused by Pronto" : "Authorization and testing need Pronto review"}</p></div>
          <Badge tone={channel.status === "active" ? "green" : "amber"}>
            {channel.status === "active" ? "Active" : channel.status === "disabled" ? "Paused" : "Setup pending"}</Badge>
        </li>)}</ul>}
    </section>
    <section className="ui-panel mt-5"><div className="ui-panel-header"><h2 className="font-semibold">Your team’s contact preferences</h2>
      <p className="text-sm text-muted">These are separate from customer-service channels. Staff commands over real messaging providers are not enabled.</p></div>
      {contacts.length === 0 ? <p className="p-4 text-sm text-muted">No verified staff destination is selected. Ask Pronto to add one.</p>
        : <ul className="divide-y divide-line">{contacts.map((contact) => <li key={contact.id} className="flex flex-wrap items-center justify-between gap-2 p-4 text-sm">
          <span>{contact.kind}{canManageContacts ? ` · ${contact.destination}` : " · team contact"}</span><Badge tone={contact.enabled ? "green" : "amber"}>
            {contact.enabled ? "Verified and enabled" : "Pending verification"}</Badge></li>)}</ul>}
    </section>
    <div className="mt-5 flex flex-wrap gap-4 text-sm">
      {canApprove ? <Link href="/client/approvals" className="font-medium text-accent">Review channel approval requests</Link> : null}
      <Link href="/client/settings" className="font-medium text-accent">Response preferences and team access</Link>
      {localStaffCommandsEnabled() ? <Link href="/client/contact-pronto" className="font-medium text-accent">Message Pronto (local test)</Link> : null}
    </div>
  </AppShell>;
}
