import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getClient } from "@/lib/dashboard";
import { AppShell } from "@/components/shell";
import { getEscalationPolicy, listStaffDestinations } from "@/lib/staff-configuration";
import { hasStaffCapability } from "@/lib/staff-permissions";
import { listStaffCapabilities, staffCapabilities } from "@/lib/staff-permissions";
import { query } from "@/lib/db";

const weekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export default async function ClientSettingsPage() {
  const actor = await requireUser("client");
  if (!actor.clientId) throw new Error("Client assignment required.");
  const [client, destinations, policy, canManage, staff, grants] = await Promise.all([
    getClient(actor.clientId), listStaffDestinations(actor.clientId), getEscalationPolicy(actor.clientId),
    hasStaffCapability(actor, actor.clientId, "staff.permissions.manage"),
    query<{ id: string; name: string; email: string }>(
      "select id, name, email from users where client_id = $1 and role = 'client' order by name", [actor.clientId]),
    listStaffCapabilities(actor.clientId),
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
    {canManage ? <section className="ui-panel mt-5 p-4"><h2 className="font-semibold">Staff permissions</h2>
      <p className="mb-3 text-sm text-muted">Grant each approval, response and channel permission separately. Record who authorized the change.</p>
      {staff.rows.map((person) => <div key={person.id} className="border-t border-line py-3 text-sm">
        <strong>{person.name}</strong> · {person.email}
        <p className="text-xs text-muted">Granted: {grants.filter((grant) => grant.user_id === person.id)
          .map((grant) => grant.permission).join(", ") || "none"}</p>
        <form action="/api/client/staff-permissions" method="post" className="mt-2 flex flex-wrap gap-2">
          <input type="hidden" name="userId" value={person.id}/>
          <select className="ui-input px-2 py-1" name="capability" aria-label={`Permission for ${person.name}`}>
            {staffCapabilities.map((capability) => <option key={capability} value={capability}>{capability}</option>)}
          </select>
          <input className="ui-input px-2 py-1" name="evidence" required aria-label={`Authorization evidence for ${person.name}`}
            placeholder="Approval reference"/>
          <button className="ui-button px-2 py-1" name="action" value="grant">Grant</button>
          <button className="ui-button px-2 py-1" name="action" value="revoke">Revoke</button>
        </form>
      </div>)}
    </section> : null}
    <section className="ui-panel mt-5 p-4"><h2 className="font-semibold">Escalation response target</h2>
      <p className="text-sm text-muted">An optional operating target. An unset target does not create an SLA.</p>
      <p className="my-2 text-sm">Current: {policy?.policy.targetMinutes == null ? "Not set" : `${policy.policy.targetMinutes} minutes`}</p>
      {canManage ? <form action="/api/client/escalation-policy" method="post" className="flex flex-wrap gap-2">
        <input type="hidden" name="expectedVersion" value={policy?.version ?? 0}/>
        <input className="ui-input px-3 py-2" name="targetMinutes" type="number" min="1" max="10080"
          aria-label="Response target in minutes" placeholder="Minutes, optional" defaultValue={policy?.policy.targetMinutes ?? ""}/>
        <input className="ui-input px-3 py-2" name="timezone" aria-label="Business timezone"
          defaultValue={policy?.policy.timezone ?? "Asia/Singapore"}/>
        <details className="w-full rounded border border-line p-3"><summary className="cursor-pointer font-medium">Staffed hours, reminders and backup</summary>
          <input type="hidden" name="staffedHoursProvided" value="1"/>
          <p className="mt-2 text-xs text-muted">Leave a day blank if staff do not cover it. Times use the business timezone above.</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">{weekdays.map((day, index) =>
            <div key={day} className="flex items-center gap-2 text-sm"><span className="w-20">{day}</span>
              <input type="time" className="ui-input px-2 py-1" name={`${index}.start`}
                aria-label={`${day} start`} defaultValue={policy?.policy.staffedHours[String(index)]?.start ?? ""}/>
              <span>to</span><input type="time" className="ui-input px-2 py-1" name={`${index}.end`}
                aria-label={`${day} end`} defaultValue={policy?.policy.staffedHours[String(index)]?.end ?? ""}/>
            </div>)}</div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <label className="text-sm">Initial contact<select name="initialDestinationId" className="ui-input mt-1 block w-full px-2 py-1"
              defaultValue={policy?.policy.initialDestinationId ?? ""}><option value="">Pronto selects a verified contact</option>
              {destinations.filter((item) => item.enabled && item.verified_at).map((item) =>
                <option key={item.id} value={item.id}>{item.kind} · {item.destination}</option>)}</select></label>
            <label className="text-sm">Backup contact<select name="backupDestinationId" className="ui-input mt-1 block w-full px-2 py-1"
              defaultValue={policy?.policy.backupDestinationId ?? ""}><option value="">No backup configured</option>
              {destinations.filter((item) => item.enabled && item.verified_at).map((item) =>
                <option key={item.id} value={item.id}>{item.kind} · {item.destination}</option>)}</select></label>
            <label className="text-sm">Reminder minutes, comma separated<input className="ui-input mt-1 block w-full px-2 py-1"
              name="reminderMinutes" defaultValue={policy?.policy.reminderMinutes.join(", ") ?? ""}/></label>
            <label className="text-sm">Out-of-hours acknowledgement<textarea className="ui-input mt-1 block w-full px-2 py-1"
              name="outOfHoursAcknowledgement" rows={2}
              defaultValue={policy?.policy.outOfHoursAcknowledgement ?? ""}/></label>
          </div>
        </details>
        <button className="ui-button px-3 py-2">Save escalation policy</button></form> : null}
    </section>
    <p className="mt-4 text-sm text-muted">Review pending business decisions in <Link className="text-accent" href="/client/approvals">Approvals</Link>.</p>
  </AppShell>;
}
