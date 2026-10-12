import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { AppShell } from "@/components/shell";
import { getClient } from "@/lib/dashboard";
import { listOnboardingStages, nextOnboardingAction, type OnboardingStageKey } from "@/lib/onboarding";
import { getEscalationPolicy, listStaffDestinations } from "@/lib/staff-configuration";
import { OperatorClientHeader, OperatorClientNav } from "@/components/operator/operator-nav";

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
  const [client, stages, destinations, policy] = await Promise.all([
    getClient(clientId), listOnboardingStages(clientId), listStaffDestinations(clientId), getEscalationPolicy(clientId),
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
      <ul className="my-3 text-sm">{destinations.map((item) => <li key={item.id}>{item.kind} · {item.audience} · {item.enabled ? "enabled" : "disabled"} · {item.verified_at ? "verified" : "unverified"}</li>)}</ul>
      <form action="/api/operator/staff-configuration" method="post" className="grid gap-2 md:grid-cols-2">
        <input type="hidden" name="action" value="destination"/><input type="hidden" name="clientId" value={clientId}/>
        <label className="text-sm">Platform<select className="ui-input block w-full px-3 py-2" name="kind"><option value="email">Email</option><option value="whatsapp">WhatsApp</option><option value="telegram">Telegram</option></select></label>
        <label className="text-sm">Audience<select className="ui-input block w-full px-3 py-2" name="audience"><option value="business">Business staff</option><option value="operator">Pronto operator</option></select></label>
        <label className="text-sm">Destination<input className="ui-input block w-full px-3 py-2" name="destination" required/></label>
        <label className="text-sm">Verified recipient user ID<input className="ui-input block w-full px-3 py-2" name="recipientUserId"/></label>
        <label className="text-sm md:col-span-2">Verification evidence<input className="ui-input block w-full px-3 py-2" name="verificationEvidence"/></label>
        <label className="text-sm"><input type="checkbox" name="verified" value="yes"/> I verified this destination</label>
        <label className="text-sm"><input type="checkbox" name="enabled" value="yes"/> Enable notifications</label>
        <button className="ui-button px-3 py-2 md:col-span-2">Save staff destination</button>
      </form>
      <p className="mt-4 text-sm">Response target: {policy?.policy.targetMinutes == null ? "Not set; no SLA assumed" : `${policy.policy.targetMinutes} minutes`} · timezone {policy?.policy.timezone ?? "not configured"}</p>
    </section>
  </AppShell>;
}
