import type { AgentConfigDetail } from "@/lib/agent/config";
import { Badge } from "@/components/badge";

export function OperatorAgentConfigPanel({
  clientId,
  detail,
}: {
  clientId: string;
  detail: AgentConfigDetail | null;
}) {
  if (!detail) {
    return (
      <section className="ui-panel">
        <div className="ui-panel-header">
          <h2 className="text-base font-semibold">Agent tuning</h2>
        </div>
        <p className="p-4 text-sm text-muted">No agent config has been created for this client.</p>
      </section>
    );
  }

  return (
    <section className="ui-panel">
      <div className="ui-panel-header">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Agent tuning</h2>
            <p className="text-sm text-muted">Operator-controlled prompt and retrieval settings.</p>
          </div>
          <Badge>{detail.config.response_provider}</Badge>
        </div>
      </div>
      <form action="/api/operator/agent-config" method="post" className="space-y-4 p-4">
        <input type="hidden" name="clientId" value={clientId} />
        <input type="hidden" name="returnTo" value={`/operator/clients/${clientId}`} />
        <label className="block space-y-2 text-sm font-medium">
          <span>Retrieval threshold</span>
          <input
            name="retrievalThreshold"
            type="number"
            min="0"
            max="1"
            step="0.0001"
            defaultValue={detail.retrievalThreshold.toFixed(4)}
            className="w-full rounded-md border border-line px-3 py-2 text-sm font-normal"
          />
        </label>
        <label className="block space-y-2 text-sm font-medium">
          <span>Prompt preamble</span>
          <textarea
            name="promptPreamble"
            rows={4}
            maxLength={4000}
            defaultValue={detail.config.prompt_preamble}
            className="w-full rounded-md border border-line px-3 py-2 text-sm font-normal"
          />
        </label>
        <label className="block space-y-2 text-sm font-medium">
          <span>Escalation rules JSON</span>
          <textarea
            name="escalationRules"
            rows={9}
            defaultValue={detail.escalationRulesJson}
            className="w-full rounded-md border border-line px-3 py-2 font-mono text-xs font-normal"
          />
        </label>
        <label className="block space-y-2 text-sm font-medium">
          <span>Change reason</span>
          <input
            name="changeReason"
            className="w-full rounded-md border border-line px-3 py-2 text-sm font-normal"
            placeholder="Optional audit note"
          />
        </label>
        <button className="ui-primary-button px-4 py-2">
          Save tuning
        </button>
      </form>
      <PromptPreview detail={detail} />
      <AgentConfigChangeHistory detail={detail} />
    </section>
  );
}

export function ClientAgentConfigPreview({
  detail,
}: {
  detail: AgentConfigDetail | null;
}) {
  if (!detail) {
    return null;
  }

  return (
    <section className="mt-6 ui-panel">
      <div className="ui-panel-header">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Agent preview</h2>
            <p className="text-sm text-muted">Read-only view of the current Pronto-managed tuning.</p>
          </div>
          <Badge>threshold {detail.retrievalThreshold.toFixed(4)}</Badge>
        </div>
      </div>
      <PromptPreview detail={detail} />
    </section>
  );
}

function PromptPreview({ detail }: { detail: AgentConfigDetail }) {
  return (
    <div className="border-t border-line p-4">
      <h3 className="mb-2 text-sm font-semibold">Prompt preview</h3>
      <pre className="max-h-[32rem] overflow-auto rounded-md border border-line bg-surface p-3 whitespace-pre-wrap text-xs leading-5 text-muted">
        {detail.promptPreview}
      </pre>
    </div>
  );
}

function AgentConfigChangeHistory({ detail }: { detail: AgentConfigDetail }) {
  return (
    <div className="border-t border-line p-4">
      <h3 className="mb-3 text-sm font-semibold">Tuning history</h3>
      {detail.recentChanges.length ? (
        <div className="divide-y divide-line rounded-md border border-line">
          {detail.recentChanges.map((change) => (
            <div key={change.id} className="p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="font-medium">{change.change_reason || "Config updated"}</p>
                <time className="text-muted" dateTime={change.created_at.toISOString()}>
                  {change.created_at.toLocaleString("en-SG", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </time>
              </div>
              <p className="mt-1 text-muted">
                threshold {thresholdFromSnapshot(change.previous_config)} to {thresholdFromSnapshot(change.new_config)}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted">No tuning changes recorded yet.</p>
      )}
    </div>
  );
}

function thresholdFromSnapshot(snapshot: Record<string, unknown>): string {
  const value = Number(snapshot.retrievalThreshold);
  return Number.isFinite(value) ? value.toFixed(4) : "n/a";
}
