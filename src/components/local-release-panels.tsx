import type { BrandVoiceProfile } from "@/lib/brand-voice";
import type { PilotReadinessSummary } from "@/lib/pilot-metrics";
import type { Client } from "@/lib/types";
import { formatSgd } from "@/lib/costing";
import { Badge } from "@/components/badge";
import { StatCard } from "@/components/stat-card";

export function OperatorBrandVoicePanel({
  clientId,
  profile,
}: {
  clientId: string;
  profile: BrandVoiceProfile;
}) {
  const document = profile.document;

  return (
    <section className="ui-panel">
      <div className="ui-panel-header">
        <h2 className="text-base font-semibold">Brand voice</h2>
        <p className="text-sm text-muted">Operator-managed voice guide and few-shot reply examples.</p>
      </div>
      <form action="/api/operator/brand-voice" method="post" className="space-y-3 p-4">
        <input type="hidden" name="action" value="update_document" />
        <input type="hidden" name="clientId" value={clientId} />
        <input type="hidden" name="returnTo" value={`/operator/clients/${clientId}`} />
        <input
          name="title"
          defaultValue={document?.title ?? "Brand voice guide"}
          className="w-full rounded-md border border-line px-3 py-2 text-sm"
        />
        <textarea
          name="content"
          rows={6}
          defaultValue={document?.content ?? ""}
          className="w-full rounded-md border border-line px-3 py-2 text-sm"
        />
        <textarea
          name="attributes"
          rows={5}
          defaultValue={JSON.stringify(document?.attributes ?? {}, null, 2)}
          className="w-full rounded-md border border-line px-3 py-2 font-mono text-xs"
        />
        <input
          name="sourceNotes"
          defaultValue={document?.source_notes ?? ""}
          className="w-full rounded-md border border-line px-3 py-2 text-sm"
          placeholder="Sources used: website, founder writing, past chats"
        />
        <button className="ui-primary-button px-4 py-2">
          Save voice guide
        </button>
      </form>

      <div className="border-t border-line p-4">
        <h3 className="mb-3 text-sm font-semibold">Few-shot examples</h3>
        <form action="/api/operator/brand-voice" method="post" className="mb-4 grid gap-3">
          <input type="hidden" name="action" value="add_example" />
          <input type="hidden" name="clientId" value={clientId} />
          <input type="hidden" name="returnTo" value={`/operator/clients/${clientId}`} />
          <textarea
            name="customerMessage"
            rows={2}
            className="rounded-md border border-line px-3 py-2 text-sm"
            placeholder="Customer message"
          />
          <textarea
            name="idealResponse"
            rows={3}
            className="rounded-md border border-line px-3 py-2 text-sm"
            placeholder="Ideal Pronto reply"
          />
          <input
            name="notes"
            className="rounded-md border border-line px-3 py-2 text-sm"
            placeholder="Optional notes"
          />
          <button className="ui-button px-3 py-2">
            Add example
          </button>
        </form>

        <div className="divide-y divide-line rounded-md border border-line">
          {profile.examples.length ? (
            profile.examples.map((example) => (
              <div key={example.id} className="space-y-3 p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={example.is_active ? "green" : "neutral"}>
                    {example.is_active ? "active" : "paused"}
                  </Badge>
                  {example.notes ? <span className="text-muted">{example.notes}</span> : null}
                </div>
                <p><span className="font-medium">Customer:</span> {example.customer_message}</p>
                <p className="text-muted"><span className="font-medium text-foreground">Reply:</span> {example.ideal_response}</p>
                <div className="flex flex-wrap gap-2">
                  <form action="/api/operator/brand-voice" method="post">
                    <input type="hidden" name="action" value="toggle_example" />
                    <input type="hidden" name="clientId" value={clientId} />
                    <input type="hidden" name="exampleId" value={example.id} />
                    <input type="hidden" name="isActive" value={example.is_active ? "false" : "true"} />
                    <input type="hidden" name="returnTo" value={`/operator/clients/${clientId}`} />
                    <button className="ui-button px-3 py-1.5">
                      {example.is_active ? "Pause" : "Activate"}
                    </button>
                  </form>
                  <form action="/api/operator/brand-voice" method="post">
                    <input type="hidden" name="action" value="delete_example" />
                    <input type="hidden" name="clientId" value={clientId} />
                    <input type="hidden" name="exampleId" value={example.id} />
                    <input type="hidden" name="returnTo" value={`/operator/clients/${clientId}`} />
                    <button className="rounded-md bg-danger px-3 py-1.5 text-sm font-semibold text-white">
                      Delete
                    </button>
                  </form>
                </div>
              </div>
            ))
          ) : (
            <p className="p-3 text-sm text-muted">No examples yet.</p>
          )}
        </div>
      </div>
    </section>
  );
}

export function ClientBrandVoicePreview({ profile }: { profile: BrandVoiceProfile }) {
  if (!profile.document && !profile.examples.length) {
    return null;
  }
  return (
    <section className="mt-6 ui-panel">
      <div className="ui-panel-header">
        <h2 className="text-base font-semibold">Brand voice</h2>
        <p className="text-sm text-muted">Read-only view of Pronto's current reply style guide.</p>
      </div>
      <div className="space-y-3 p-4 text-sm">
        {profile.document ? (
          <>
            <p className="font-medium">{profile.document.title}</p>
            <p className="whitespace-pre-wrap text-muted">{profile.document.content}</p>
          </>
        ) : null}
        {profile.examples.length ? (
          <div className="rounded-md border border-line">
            {profile.examples.filter((example) => example.is_active).slice(0, 3).map((example) => (
              <div key={example.id} className="border-t border-line p-3 first:border-t-0">
                <p><span className="font-medium">Customer:</span> {example.customer_message}</p>
                <p className="mt-1 text-muted"><span className="font-medium text-foreground">Reply:</span> {example.ideal_response}</p>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}

export function PilotReadinessPanel({
  summary,
}: {
  summary: PilotReadinessSummary;
}) {
  return (
    <section className="ui-panel">
      <div className="ui-panel-header">
        <h2 className="text-base font-semibold">Pilot readiness</h2>
      </div>
      <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Escalation accuracy" value={percentOrPending(summary.escalationAccuracy)} />
        <StatCard label="CSAT" value={summary.csatAverage ? summary.csatAverage.toFixed(1) : "Pending"} hint={`${summary.csatResponses} responses`} />
        <StatCard label="First response" value={durationOrPending(summary.avgFirstResponseSeconds)} />
        <StatCard label="Pilot blockers" value={summary.pilotBlockers} />
      </div>
      <div className="grid gap-4 border-t border-line p-4 text-sm md:grid-cols-2">
        <div>
          <p className="font-medium">Launch timing</p>
          <dl className="mt-2 space-y-2 text-muted">
            <div className="flex justify-between gap-4">
              <dt>First pilot conversation</dt>
              <dd className="font-medium text-foreground">{durationOrPending(summary.timeToFirstPilotConversationSeconds)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt>Signed to live</dt>
              <dd className="font-medium text-foreground">{durationOrPending(summary.timeToLiveAgentSeconds)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt>Target live date</dt>
              <dd className="font-medium text-foreground">{dateOrPending(summary.launchMilestones?.target_live_at)}</dd>
            </div>
          </dl>
        </div>
        <div>
          <p className="font-medium">Quality gates</p>
          <dl className="mt-2 space-y-2 text-muted">
            <div className="flex justify-between gap-4">
              <dt>Reviewed conversations</dt>
              <dd className="font-medium text-foreground">{summary.reviewedConversations}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt>Hallucinations</dt>
              <dd className="font-medium text-foreground">{summary.hallucinations}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt>30-day LLM cost</dt>
              <dd className="font-medium text-foreground">{formatSgd(summary.monthlyLlmCostSgd)}</dd>
            </div>
          </dl>
        </div>
      </div>
    </section>
  );
}

export function OperatorCommercialPanel({
  client,
  summary,
}: {
  client: Client;
  summary: PilotReadinessSummary;
}) {
  const commercial = summary.commercialAssumptions;
  const launch = summary.launchMilestones;

  return (
    <section className="ui-panel">
      <div className="ui-panel-header">
        <h2 className="text-base font-semibold">Commercial assumptions</h2>
        <p className="text-sm text-muted">Benchmark pricing inputs for local-release margin checks.</p>
      </div>
      <div className="grid gap-3 p-4 md:grid-cols-3">
        <StatCard label="Gross margin" value={summary.estimatedGrossMarginSgd === null ? "Pending" : formatSgd(summary.estimatedGrossMarginSgd)} />
        <StatCard label="30-day LLM cost" value={formatSgd(summary.monthlyLlmCostSgd)} />
        <StatCard label="Included conversations" value={commercial?.included_conversations ?? 500} />
      </div>
      <form action="/api/operator/client-commercials" method="post" className="grid gap-3 border-t border-line p-4 sm:grid-cols-2">
        <input type="hidden" name="clientId" value={client.id} />
        <input type="hidden" name="returnTo" value={`/operator/clients/${client.id}`} />
        <DateInput name="signedContractAt" label="Signed contract" value={launch?.signed_contract_at} />
        <DateInput name="targetLiveAt" label="Target live" value={launch?.target_live_at} />
        <DateInput name="productionLiveAt" label="Production live" value={launch?.production_live_at} />
        <NumberInput name="monthlyRetainerSgd" label="Monthly retainer SGD" value={commercial?.monthly_retainer_sgd ?? "1200"} />
        <NumberInput name="setupFeeSgd" label="Setup fee SGD" value={commercial?.setup_fee_sgd ?? "2500"} />
        <NumberInput name="amortizedSetupMonths" label="Setup amortization months" value={commercial?.amortized_setup_months ?? 6} />
        <NumberInput name="hostingCostSgd" label="Hosting cost SGD" value={commercial?.hosting_cost_sgd ?? "80"} />
        <NumberInput name="integrationCostSgd" label="Integration cost SGD" value={commercial?.integration_cost_sgd ?? "150"} />
        <NumberInput name="includedConversations" label="Included conversations" value={commercial?.included_conversations ?? 500} />
        <NumberInput name="llmCostBufferMultiplier" label="LLM cost buffer" value={commercial?.llm_cost_buffer_multiplier ?? "2"} step="0.1" />
        <label className="block space-y-2 text-sm font-medium sm:col-span-2">
          <span>Launch notes</span>
          <input
            name="launchNotes"
            defaultValue={launch?.notes ?? ""}
            className="w-full rounded-md border border-line px-3 py-2 text-sm font-normal"
          />
        </label>
        <button className="ui-primary-button px-4 py-2 sm:col-span-2">
          Save assumptions
        </button>
      </form>
    </section>
  );
}

function NumberInput({
  name,
  label,
  value,
  step = "1",
}: {
  name: string;
  label: string;
  value: string | number;
  step?: string;
}) {
  return (
    <label className="block space-y-2 text-sm font-medium">
      <span>{label}</span>
      <input
        name={name}
        type="number"
        min="0"
        step={step}
        defaultValue={String(value)}
        className="w-full rounded-md border border-line px-3 py-2 text-sm font-normal"
      />
    </label>
  );
}

function DateInput({ name, label, value }: { name: string; label: string; value?: Date | null }) {
  return (
    <label className="block space-y-2 text-sm font-medium">
      <span>{label}</span>
      <input
        name={name}
        type="datetime-local"
        defaultValue={value ? toDatetimeLocal(value) : ""}
        className="w-full rounded-md border border-line px-3 py-2 text-sm font-normal"
      />
    </label>
  );
}

function percentOrPending(value: number | null): string {
  return value === null ? "Pending" : `${Math.round(value * 100)}%`;
}

function durationOrPending(value: number | null | undefined): string {
  if (value === null || value === undefined) {
    return "Pending";
  }
  if (value < 90) {
    return `${Math.round(value)}s`;
  }
  if (value < 3600) {
    return `${Math.round(value / 60)}m`;
  }
  if (value < 86_400) {
    return `${(value / 3600).toFixed(1)}h`;
  }
  return `${(value / 86_400).toFixed(1)}d`;
}

function dateOrPending(value: Date | null | undefined): string {
  return value ? value.toLocaleDateString("en-SG", { dateStyle: "medium" }) : "Pending";
}

function toDatetimeLocal(value: Date): string {
  const offsetMs = value.getTimezoneOffset() * 60_000;
  return new Date(value.getTime() - offsetMs).toISOString().slice(0, 16);
}
