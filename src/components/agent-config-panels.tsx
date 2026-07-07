import type { AgentConfigDetail } from "@/lib/agent/config";
import {
  getProviderReadiness,
  type ReadinessTone,
} from "@/lib/agent/readiness";
import { Badge } from "@/components/badge";

export function OperatorAgentConfigPanel({
  clientId,
  detail,
  returnTo,
}: {
  clientId: string;
  detail: AgentConfigDetail | null;
  returnTo?: string;
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
  const formReturnTo = returnTo ?? `/operator/clients/${clientId}`;

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
        <input type="hidden" name="returnTo" value={formReturnTo} />
        <div className="grid gap-3 lg:grid-cols-2">
          <label className="block space-y-2 text-sm font-medium">
            <span>Response provider</span>
            <select
              name="responseProvider"
              defaultValue={detail.config.response_provider}
              className="w-full rounded-md border border-line px-3 py-2 text-sm font-normal"
            >
              <option value="mock">Mock local</option>
              <option value="openai">OpenAI</option>
              <option value="azure">Azure OpenAI</option>
              <option value="anthropic">Anthropic</option>
            </select>
          </label>
          <label className="block space-y-2 text-sm font-medium">
            <span>Response model</span>
            <input
              name="responseModel"
              defaultValue={detail.config.response_model}
              list="response-model-options"
              className="w-full rounded-md border border-line px-3 py-2 text-sm font-normal"
            />
          </label>
          <label className="block space-y-2 text-sm font-medium">
            <span>Embedding provider</span>
            <select
              name="embeddingProvider"
              defaultValue={detail.config.embedding_provider}
              className="w-full rounded-md border border-line px-3 py-2 text-sm font-normal"
            >
              <option value="mock">Mock local</option>
              <option value="openai">OpenAI</option>
              <option value="azure">Azure OpenAI</option>
            </select>
          </label>
          <label className="block space-y-2 text-sm font-medium">
            <span>Embedding model</span>
            <input
              name="embeddingModel"
              defaultValue={detail.config.embedding_model}
              className="w-full rounded-md border border-line px-3 py-2 text-sm font-normal"
            />
          </label>
        </div>
        <datalist id="response-model-options">
          <option value="mock" />
          <option value="gpt-5.5" />
          <option value="gpt-5" />
          <option value="gpt-5-deployment" />
          <option value="claude-sonnet-4-5" />
        </datalist>
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
      <ProviderReadinessPanel detail={detail} />
      <PromptPreview detail={detail} />
      <AgentConfigChangeHistory detail={detail} />
    </section>
  );
}

function ProviderReadinessPanel({ detail }: { detail: AgentConfigDetail }) {
  const readiness = getProviderReadiness(detail);

  return (
    <div className="border-t border-line p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Live AI readiness</h3>
          <p className="text-xs text-muted">
            Current local runtime and credential status before switching a pilot off mock AI.
          </p>
        </div>
        <Badge tone={readiness.readyForLive ? "green" : "amber"}>
          {readiness.readyForLive ? "live-ready" : "not live-ready"}
        </Badge>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {readiness.checks.map((check) => (
          <div key={check.label} className="rounded-md border border-line p-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <p className="font-medium">{check.label}</p>
              <Badge tone={badgeTone(check.tone)}>{check.tone}</Badge>
            </div>
            <p className="mt-1 text-xs text-muted">{check.detail}</p>
          </div>
        ))}
      </div>
      {!readiness.encryptionConfigured ? (
        <p className="mt-3 rounded-md bg-warning-bg p-3 text-xs text-warning">
          PRONTO_SECRETS_KEY is not configured, so provider keys can only come from environment variables.
        </p>
      ) : null}
    </div>
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
          <div className="flex flex-wrap items-center gap-2">
            <Badge>{detail.config.response_provider}</Badge>
            <Badge>threshold {detail.retrievalThreshold.toFixed(4)}</Badge>
          </div>
        </div>
      </div>
      <PromptPreview detail={detail} />
    </section>
  );
}

function badgeTone(tone: ReadinessTone): "green" | "amber" | "red" {
  if (tone === "ready") {
    return "green";
  }
  if (tone === "warning") {
    return "amber";
  }
  return "red";
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
