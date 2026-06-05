import type { AgentConfigDetail } from "@/lib/agent/config";
import { credentialEncryptionConfigured } from "@/lib/llm/credentials";
import { FREE_LLM_PROVIDERS, selectableFreeProviders } from "@/lib/llm/free-providers";
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
              <option value="anthropic">Anthropic</option>
              {selectableFreeProviders().map((provider) => (
                <option key={provider.id} value={provider.id}>
                  {provider.priority === "no-key" ? "No-key: " : "Free: "}
                  {provider.name}
                </option>
              ))}
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
          <option value="claude-sonnet-4-5" />
          {FREE_LLM_PROVIDERS.flatMap((provider) =>
            provider.models.map((model) => (
              <option key={`${provider.id}-${model}`} value={model}>
                {provider.name}
              </option>
            )),
          )}
        </datalist>
        <label className="block space-y-2 text-sm font-medium">
          <span>Provider API key</span>
          <input
            name="providerApiKey"
            type="password"
            autoComplete="off"
            className="w-full rounded-md border border-line px-3 py-2 text-sm font-normal"
            placeholder={
              credentialEncryptionConfigured()
                ? "Optional: paste a new key for the selected response provider"
                : "Set PRONTO_SECRETS_KEY before saving DB credentials"
            }
          />
          <span className="block text-xs font-normal text-muted">
            {credentialStatusLabel(detail)}
          </span>
        </label>
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
      <ProviderCatalog />
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

function ProviderCatalog() {
  return (
    <div className="border-t border-line p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Free provider catalog</h3>
          <p className="text-xs text-muted">
            Sourced from mnfst/awesome-free-llm-apis. OpenAI-compatible providers are selectable now.
          </p>
        </div>
        <Badge tone="green">
          {selectableFreeProviders().length}/{FREE_LLM_PROVIDERS.length} wired
        </Badge>
      </div>
      <div className="max-h-72 overflow-auto rounded-md border border-line">
        <table className="w-full min-w-[42rem] text-left text-xs">
          <thead className="bg-surface text-muted">
            <tr>
              <th className="px-3 py-2 font-medium">Provider</th>
              <th className="px-3 py-2 font-medium">Default model</th>
              <th className="px-3 py-2 font-medium">Access</th>
              <th className="px-3 py-2 font-medium">Runtime</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {FREE_LLM_PROVIDERS.map((provider) => (
              <tr key={provider.id}>
                <td className="px-3 py-2">
                  <a
                    className="font-medium text-foreground hover:underline"
                    href={provider.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {provider.name}
                  </a>
                  <p className="mt-1 text-muted">{provider.description}</p>
                </td>
                <td className="px-3 py-2 font-mono text-[11px] text-muted">
                  {provider.defaultModel}
                </td>
                <td className="px-3 py-2">
                  {provider.requiresApiKey ? (
                    <Badge tone="amber">API key</Badge>
                  ) : (
                    <Badge tone="green">No key</Badge>
                  )}
                </td>
                <td className="px-3 py-2">
                  {provider.openAiCompatible ? (
                    <Badge tone="green">selectable</Badge>
                  ) : (
                    <Badge>catalog only</Badge>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function credentialStatusLabel(detail: AgentConfigDetail): string {
  const responseProvider = detail.config.response_provider;
  const status = detail.providerCredentialStatuses.find(
    (credential) => credential.provider === responseProvider,
  );
  if (status) {
    return `Saved credential for ${responseProvider} will be reused. Entering a key replaces it.`;
  }
  const provider = FREE_LLM_PROVIDERS.find((candidate) => candidate.id === responseProvider);
  if (provider && !provider.requiresApiKey) {
    return `${provider.name} can be tested without a saved key.`;
  }
  return "Leave blank to reuse env vars or existing saved credentials.";
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
