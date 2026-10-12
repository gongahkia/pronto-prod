import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { AppShell } from "@/components/shell";
import { getClient } from "@/lib/dashboard";
import { listOnboardingStages, nextOnboardingAction, type OnboardingStageKey } from "@/lib/onboarding";
import { getEscalationPolicy, listStaffDestinations } from "@/lib/staff-configuration";
import { OperatorClientHeader, OperatorClientNav } from "@/components/operator/operator-nav";
import { query } from "@/lib/db";

const fields: Record<OnboardingStageKey, { title: string; details: Array<[string, string]>; evidence: Array<[string, string]> }> = {
  profile: { title: "1. Profile & discovery", details: [["businessName", "Business name"], ["timezone", "Timezone"], ["serviceScope", "Customer questions in scope"], ["outletAddress", "Outlet address (optional)"]], evidence: [["sourceReview", "Business facts and owner review"]] },
  communications: { title: "2. Communication preferences", details: [["customerChannels", "Customer channel choices"], ["staffPreference", "Staff notification preference"], ["accountProgress", "Provider account and permission progress"]], evidence: [["identityReview", "Customer and staff identity verification"]] },
  knowledge: { title: "3. Knowledge & assistant rules", details: [["knowledgeScope", "Approved knowledge scope"], ["escalationRules", "When Pronto hands off"]], evidence: [["sourceReview", "Source review and conflict decisions"]] },
  testing: { title: "4. Private testing & approval", details: [["testPlan", "Questions and failure cases tested"]], evidence: [["localTest", "Local test record"], ["handoffTest", "Human handoff test record"]] },
  activation: { title: "5. Activation & monitoring", details: [["monitorOwner", "Pronto monitoring owner"], ["rollbackContact", "Rollback contact"]], evidence: [["approvalRecord", "Business signoff and technical activation evidence"]] },
};

export default async function OnboardingPage({ params }: { params: Promise<{ clientId: string }> }) {
  const actor = await requireUser("operator");
  const { clientId } = await params;
  const [client, stages, destinations, policy, staffUsers] = await Promise.all([
    getClient(clientId), listOnboardingStages(clientId), listStaffDestinations(clientId), getEscalationPolicy(clientId),
    query<{ id: string; name: string; email: string; role: string }>(
      "select id, name, email, role from users where client_id = $1 or role = 'operator' order by role, name", [clientId]),
  ]);
  if (!client) notFound();
  return <AppShell user={actor} active="operator" operatorActive="businesses">
    <OperatorClientHeader client={client} description="Prepare, test and approve this business before activation." />
    <OperatorClientNav clientId={clientId} active="onboarding" />
    <div className="ui-panel mb-5 p-4"><h2 className="font-semibold">Next action</h2>
      <p className="text-sm">{nextOnboardingAction(stages)}</p>
      <p className="mt-2 text-xs text-muted">All stages are tracked separately from business status. Saving a reviewed stage creates a new revision.</p></div>
    <div className="space-y-5">{stages.map((stage) => {
      const config = fields[stage.stage];
      return <section key={stage.stage} className="ui-panel" id={stage.stage}>
        <div className="ui-panel-header"><h2 className="font-semibold">{config.title}</h2>
          <p className="text-sm text-muted">{stage.state} · revision {stage.revision}{stage.approved_by ? " · business approved" : ""}</p></div>
        <form action="/api/operator/onboarding" method="post" className="grid gap-3 p-4 md:grid-cols-2">
          <input type="hidden" name="clientId" value={clientId}/><input type="hidden" name="stage" value={stage.stage}/>
          <input type="hidden" name="revision" value={stage.revision}/>
          {config.details.map(([key, label]) => <label className="block text-sm" key={key}>{label}
            <textarea className="ui-input mt-1 block w-full px-3 py-2" name={`detail.${key}`} rows={2}
              defaultValue={String(stage.details[key] ?? "")}/></label>)}
          {config.evidence.map(([key, label]) => <label className="block text-sm" key={key}>{label}
            <textarea className="ui-input mt-1 block w-full px-3 py-2" name={`evidence.${key}`} rows={2}
              defaultValue={String(stage.evidence[key] ?? "")}/></label>)}
          <label className="block text-sm">Outstanding blockers, one per line
            <textarea className="ui-input mt-1 block w-full px-3 py-2" name="blockers" rows={2} defaultValue={stage.blockers.join("\n")}/></label>
          <label className="block text-sm">Optional item not applicable because
            <input className="ui-input mt-1 block w-full px-3 py-2" name="notApplicableReason" defaultValue={stage.not_applicable_reason ?? ""}/></label>
          <div className="flex flex-wrap gap-2 md:col-span-2"><button className="ui-button px-3 py-2" name="action" value="save">Save draft</button>
            <button className="ui-primary-button px-3 py-2" name="action" value="submit">Request business review</button>
            {stage.stage === "activation" && stage.state === "approved" ? <button className="ui-button px-3 py-2" name="action" value="activate">Activate approved business</button> : null}
          </div>
        </form>
      </section>;
    })}</div>
    <section className="ui-panel mt-5 p-4"><h2 className="font-semibold">Staff notification destinations</h2>
      <p className="text-sm text-muted">Independent of customer channel settings. Verification requires recorded evidence.</p>
      <p className="text-xs text-muted">When assigning or changing a recipient, save the identity first, then verify and enable in a separate review.</p>
      <div className="my-3 space-y-3">{destinations.map((item) => <form key={item.id}
        action="/api/operator/staff-configuration" method="post" className="rounded border border-line p-3 text-sm">
        <input type="hidden" name="action" value="destination"/><input type="hidden" name="clientId" value={clientId}/>
        <input type="hidden" name="id" value={item.id}/><input type="hidden" name="kind" value={item.kind}/>
        <input type="hidden" name="audience" value={item.audience}/><input type="hidden" name="destination" value={item.destination}/>
        <p className="font-medium">{item.kind} · {item.audience} · {item.destination}</p>
        <p className="text-muted">{item.enabled ? "enabled" : "disabled"} · {item.verified_at ? "verified" : "unverified"}</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <select name="recipientUserId" defaultValue={item.recipient_user_id ?? ""} className="ui-input px-2 py-1"
            aria-label={`Authorized recipient for ${item.destination}`}><option value="">Select authorized user</option>
            {staffUsers.rows.filter((person) => person.role === (item.audience === "operator" ? "operator" : "client"))
              .map((person) => <option key={person.id} value={person.id}>{person.name} · {person.email}</option>)}</select>
          <input className="ui-input px-2 py-1" name="verificationEvidence" aria-label={`Verification evidence for ${item.destination}`}
            placeholder="Verification record" defaultValue={item.verification_evidence ?? ""}/>
          <label><input type="checkbox" name="verified" value="yes" defaultChecked={Boolean(item.verified_at)}/> Verified</label>
          <label><input type="checkbox" name="enabled" value="yes" defaultChecked={item.enabled}/> Enabled</label>
          <button className="ui-button px-2 py-1">Save contact</button>
        </div>
      </form>)}</div>
      <form action="/api/operator/staff-configuration" method="post" className="grid gap-2 md:grid-cols-2">
        <input type="hidden" name="action" value="destination"/><input type="hidden" name="clientId" value={clientId}/>
        <label className="text-sm">Platform<select className="ui-input block w-full px-3 py-2" name="kind"><option value="email">Email</option><option value="whatsapp">WhatsApp</option><option value="telegram">Telegram</option></select></label>
        <label className="text-sm">Audience<select className="ui-input block w-full px-3 py-2" name="audience"><option value="business">Business staff</option><option value="operator">Pronto operator</option></select></label>
        <label className="text-sm">Destination<input className="ui-input block w-full px-3 py-2" name="destination" required/></label>
        <label className="text-sm">Recipient user<select className="ui-input block w-full px-3 py-2" name="recipientUserId">
          <option value="">Select after choosing audience</option>
          {staffUsers.rows.map((person) => <option key={person.id} value={person.id}>{person.role} · {person.name} · {person.email}</option>)}
        </select></label>
        <label className="text-sm md:col-span-2">Verification evidence<input className="ui-input block w-full px-3 py-2" name="verificationEvidence"/></label>
        <label className="text-sm"><input type="checkbox" name="verified" value="yes"/> I verified this destination</label>
        <label className="text-sm"><input type="checkbox" name="enabled" value="yes"/> Enable notifications</label>
        <button className="ui-button px-3 py-2 md:col-span-2">Save staff destination</button>
      </form>
      <p className="mt-4 text-sm">Response target: {policy?.policy.targetMinutes == null ? "Not set; no SLA assumed" : `${policy.policy.targetMinutes} minutes`} · timezone {policy?.policy.timezone ?? "not configured"}</p>
      <details className="mt-3 rounded border border-line p-3"><summary className="cursor-pointer text-sm font-medium">Advanced escalation policy</summary>
        <p className="mt-2 text-xs text-muted">Set optional staffed hours, reminders, backup destination and out-of-hours acknowledgement. No reminder or backup send is scheduled in Tranche A.</p>
        <form action="/api/operator/staff-configuration" method="post" className="mt-2 space-y-2">
          <input type="hidden" name="action" value="policy"/><input type="hidden" name="clientId" value={clientId}/>
          <input type="hidden" name="expectedVersion" value={policy?.version ?? 0}/>
          <textarea className="ui-input block w-full px-3 py-2 font-mono text-xs" name="policy" rows={10}
            aria-label="Escalation policy JSON" defaultValue={JSON.stringify(policy?.policy ?? {
              targetMinutes: null, timezone: String(client.business_profile.timezone ?? "Asia/Singapore"),
              staffedHours: {}, initialDestinationId: null, reminderMinutes: [], backupDestinationId: null,
              outOfHoursAcknowledgement: null,
            }, null, 2)}/>
          <button className="ui-button px-3 py-2">Save policy revision</button>
        </form>
      </details>
    </section>
  </AppShell>;
}
