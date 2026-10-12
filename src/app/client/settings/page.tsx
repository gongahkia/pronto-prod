import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getClient } from "@/lib/dashboard";
import { AppShell } from "@/components/shell";
import { getEscalationPolicy, listStaffDestinations } from "@/lib/staff-configuration";
import { hasStaffCapability } from "@/lib/staff-permissions";

export default async function ClientSettingsPage() {
  const actor = await requireUser("client");
  if (!actor.clientId) throw new Error("Client assignment required.");
  const [client, destinations, policy, canManage] = await Promise.all([
    getClient(actor.clientId), listStaffDestinations(actor.clientId), getEscalationPolicy(actor.clientId),
    hasStaffCapability(actor, actor.clientId, "staff.permissions.manage"),
  ]);
  if (!client) throw new Error("Business not found.");
  return <AppShell user={actor} active="client" clientActive="settings" workspaceName={client.name}>
    <h1 className="mb-5 text-xl font-semibold">Settings</h1>
    <section className="ui-panel mb-5 p-4"><h2 className="font-semibold">Business location</h2>
      <form action="/api/client/settings" method="post" className="mt-3 flex flex-wrap gap-2">
        <input type="hidden" name="action" value="location"/>
        <input name="location" aria-label="Business location" className="ui-input min-w-64 flex-1 px-3 py-2"
          defaultValue={String(client.business_profile.location ?? "")}/>
        <button className="ui-primary-button px-3 py-2">Save location</button>
      </form></section>
    <section className="ui-panel p-4"><h2 className="font-semibold">Staff notification destinations</h2>
      <p className="text-sm text-muted">These contacts are independent of customer messaging channels. Pronto verifies a destination before using it.</p>
      <ul className="mt-3 text-sm">{destinations.map((item) =>
        <li key={item.id}>{item.kind} · {item.enabled ? "enabled" : "pending"} · {item.verified_at ? "verified" : "unverified"}</li>)}</ul>
      {canManage ? <form action="/api/client/settings" method="post" className="mt-3 flex flex-wrap gap-2">
        <input type="hidden" name="action" value="staff_destination"/>
        <select name="kind" aria-label="Staff contact platform" className="ui-input px-3 py-2">
          <option value="email">Email</option><option value="whatsapp">WhatsApp</option><option value="telegram">Telegram</option></select>
        <input name="destination" aria-label="Staff destination" required className="ui-input min-w-56 flex-1 px-3 py-2"/>
        <button className="ui-button px-3 py-2">Propose contact</button></form>
        : <p className="mt-3 text-sm text-muted">Ask an authorized staff manager or Pronto operator to change notification contacts.</p>}
    </section>
    <section className="ui-panel mt-5 p-4"><h2 className="font-semibold">Escalation response target</h2>
      <p className="text-sm text-muted">An optional operating target. An unset target does not create an SLA.</p>
      <p className="my-2 text-sm">Current: {policy?.policy.targetMinutes == null ? "Not set" : `${policy.policy.targetMinutes} minutes`}</p>
      {canManage ? <form action="/api/client/escalation-policy" method="post" className="flex flex-wrap gap-2">
        <input type="hidden" name="expectedVersion" value={policy?.version ?? 0}/>
        <input className="ui-input px-3 py-2" name="targetMinutes" type="number" min="1" max="10080"
          aria-label="Response target in minutes" placeholder="Minutes, optional" defaultValue={policy?.policy.targetMinutes ?? ""}/>
        <input className="ui-input px-3 py-2" name="timezone" aria-label="Business timezone"
          defaultValue={policy?.policy.timezone ?? "Asia/Singapore"}/>
        <button className="ui-button px-3 py-2">Save target</button></form> : null}
    </section>
    <p className="mt-4 text-sm text-muted">Review pending business decisions in <Link className="text-accent" href="/client/approvals">Approvals</Link>.</p>
  </AppShell>;
}
