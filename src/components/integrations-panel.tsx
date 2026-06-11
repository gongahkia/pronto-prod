"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type {
  IntegrationDefinition,
  IntegrationProvider,
} from "@/lib/integrations/types";
import type { IntegrationCredentialStatus } from "@/lib/integrations/credentials";

type Props = {
  clientId: string;
  definitions: IntegrationDefinition[];
  credentials: IntegrationCredentialStatus[];
  encryptionConfigured: boolean;
};

type FormState = {
  provider: IntegrationProvider;
  label: string;
  apiKey: string;
  metadata: Record<string, string>;
  rotationDueAt: string;
};

type TestResultState =
  | { kind: "idle" }
  | { kind: "running" }
  | { kind: "result"; ok: boolean; body: unknown };

const defaultForm = (definition: IntegrationDefinition): FormState => ({
  provider: definition.provider,
  label: "",
  apiKey: "",
  metadata: Object.fromEntries(
    definition.credentialFields
      .filter((field) => !field.secret)
      .map((field) => [field.name, ""]),
  ),
  rotationDueAt: "",
});

export function IntegrationsPanel(props: Props) {
  const router = useRouter();
  const [active, setActive] = useState<IntegrationDefinition>(props.definitions[0]);
  const [form, setForm] = useState<FormState>(defaultForm(props.definitions[0]));
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [test, setTest] = useState<TestResultState>({ kind: "idle" });
  const [testArgs, setTestArgs] = useState<Record<string, string>>({});
  const [pendingDelete, setPendingDelete] = useState<{
    provider: IntegrationProvider;
    label: string | null;
  } | null>(null);
  const [isPending, startTransition] = useTransition();

  function changeProvider(provider: IntegrationProvider) {
    const definition =
      props.definitions.find((entry) => entry.provider === provider) ?? props.definitions[0];
    setActive(definition);
    setForm(defaultForm(definition));
    setTest({ kind: "idle" });
    setTestArgs({});
    setMessage(null);
    setError(null);
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    const response = await fetch("/api/operator/integrations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientId: props.clientId,
        provider: form.provider,
        label: form.label || undefined,
        apiKey: form.apiKey,
        metadata: form.metadata,
        rotationDueAt: form.rotationDueAt || undefined,
      }),
    });
    if (!response.ok) {
      setError(await responseErrorMessage(response, "Save failed."));
      return;
    }
    setMessage("Saved.");
    setForm(defaultForm(active));
    startTransition(() => router.refresh());
  }

  async function remove() {
    if (!pendingDelete) return;
    const response = await fetch("/api/operator/integrations", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientId: props.clientId,
        provider: pendingDelete.provider,
        label: pendingDelete.label ?? undefined,
      }),
    });
    if (!response.ok) {
      setError(await responseErrorMessage(response, "Delete failed."));
      return;
    }
    setPendingDelete(null);
    startTransition(() => router.refresh());
  }

  async function runTest() {
    setTest({ kind: "running" });
    const response = await fetch("/api/operator/integrations/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientId: props.clientId,
        provider: active.provider,
        args: testArgs,
      }),
    });
    const body = await response.json();
    setTest({ kind: "result", ok: response.ok, body });
  }

  return (
    <div className="space-y-6">
      {!props.encryptionConfigured && (
        <div className="rounded border border-amber-700 bg-amber-950/40 p-3 text-sm">
          PRONTO_SECRETS_KEY is not set. Saving credentials will fail.
        </div>
      )}

      <section className="ui-panel">
        <div className="ui-panel-header">
          <h2 className="text-base font-semibold">Connected integrations</h2>
        </div>
        <ul className="divide-y divide-line">
          {props.credentials.length === 0 && (
            <li className="px-4 py-6 text-center text-sm text-muted">
              No integration credentials connected yet.
            </li>
          )}
          {props.credentials.map((credential) => (
            <li
              key={credential.id}
              className="flex flex-wrap items-baseline justify-between gap-3 px-4 py-3 text-sm"
            >
              <div>
                <p className="font-medium">{credential.provider}</p>
                <p className="text-xs text-muted">
                  {credential.label ?? "default"} · last rotated{" "}
                  {credential.lastRotatedAt
                    ? credential.lastRotatedAt.toISOString().slice(0, 10)
                    : "never"}
                  {credential.rotationDueAt
                    ? ` · rotation due ${credential.rotationDueAt.toISOString().slice(0, 10)}`
                    : ""}
                </p>
              </div>
              <button
                type="button"
                className="ui-button px-3 py-1"
                onClick={() =>
                  setPendingDelete({
                    provider: credential.provider as IntegrationProvider,
                    label: credential.label,
                  })
                }
                disabled={isPending}
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="ui-panel">
        <div className="ui-panel-header">
          <h2 className="text-base font-semibold">Add or rotate credential</h2>
        </div>
        <div className="space-y-4 p-4">
          <label className="block text-sm">
            <span className="text-muted">Integration</span>
            <select
              className="ui-input mt-1 block w-full"
              value={form.provider}
              onChange={(event) => changeProvider(event.target.value as IntegrationProvider)}
            >
              {props.definitions.map((definition) => (
                <option key={definition.provider} value={definition.provider}>
                  {definition.label}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-muted">{active.description}</p>
          </label>

          <form className="space-y-3" onSubmit={save}>
            <label className="block text-sm">
              <span className="text-muted">Label (optional)</span>
              <input
                className="ui-input mt-1 block w-full"
                type="text"
                value={form.label}
                onChange={(event) =>
                  setForm({ ...form, label: event.target.value })
                }
              />
            </label>
            {active.credentialFields
              .filter((field) => field.secret)
              .map((field) => (
                <label key={field.name} className="block text-sm">
                  <span className="text-muted">{field.label}</span>
                  <input
                    className="ui-input mt-1 block w-full"
                    type="password"
                    value={form.apiKey}
                    onChange={(event) =>
                      setForm({ ...form, apiKey: event.target.value })
                    }
                    required={field.required}
                  />
                </label>
              ))}
            {active.credentialFields
              .filter((field) => !field.secret)
              .map((field) => (
                <label key={field.name} className="block text-sm">
                  <span className="text-muted">{field.label}</span>
                  <input
                    className="ui-input mt-1 block w-full"
                    type="text"
                    value={form.metadata[field.name] ?? ""}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        metadata: { ...form.metadata, [field.name]: event.target.value },
                      })
                    }
                    required={field.required}
                  />
                </label>
              ))}
            <label className="block text-sm">
              <span className="text-muted">Rotation due (optional)</span>
              <input
                className="ui-input mt-1 block w-full"
                type="date"
                value={form.rotationDueAt}
                onChange={(event) =>
                  setForm({ ...form, rotationDueAt: event.target.value })
                }
              />
            </label>
            <div className="flex items-center gap-3">
              <button
                type="submit"
                className="ui-button px-3 py-2"
                disabled={isPending}
              >
                Save
              </button>
              {message && <span className="text-xs text-success">{message}</span>}
              {error && <span className="text-xs text-danger">{error}</span>}
            </div>
          </form>
        </div>
      </section>

      <section className="ui-panel">
        <div className="ui-panel-header">
          <h2 className="text-base font-semibold">Test {active.label}</h2>
          <p className="text-sm text-muted">
            Live call against current credentials. Escalation triggers:{" "}
            {active.escalateOn.join(", ") || "none"}.
          </p>
        </div>
        <div className="space-y-3 p-4">
          {testArgsConfig(active.provider).map((field) => (
            <label key={field.name} className="block text-sm">
              <span className="text-muted">{field.label}</span>
              <input
                className="ui-input mt-1 block w-full"
                type="text"
                value={testArgs[field.name] ?? ""}
                onChange={(event) =>
                  setTestArgs({ ...testArgs, [field.name]: event.target.value })
                }
              />
            </label>
          ))}
          <button
            type="button"
            className="ui-button px-3 py-2"
            onClick={runTest}
            disabled={test.kind === "running"}
          >
            Run test
          </button>
          {test.kind === "result" && (
            <pre className="overflow-x-auto rounded bg-surface p-3 text-xs">
              {JSON.stringify(test.body, null, 2)}
            </pre>
          )}
        </div>
      </section>
      {pendingDelete ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="delete-credential-title"
          aria-describedby="delete-credential-description"
        >
          <div className="w-full max-w-sm rounded-lg border border-line bg-panel p-4 shadow-xl">
            <h2 id="delete-credential-title" className="text-base font-semibold">
              Delete credential?
            </h2>
            <p id="delete-credential-description" className="mt-2 text-sm text-muted">
              This removes the saved {pendingDelete.provider} credential for this client.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="ui-button px-3 py-2"
                onClick={() => setPendingDelete(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="ui-danger-button px-3 py-2"
                onClick={remove}
                disabled={isPending}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

async function responseErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const body = (await response.json()) as { error?: unknown };
    return typeof body.error === "string" && body.error ? body.error : fallback;
  } catch {
    return fallback;
  }
}

function testArgsConfig(provider: IntegrationProvider): { name: string; label: string }[] {
  switch (provider) {
    case "google_calendar":
    case "calendly":
      return [
        { name: "windowStart", label: "Window start (ISO 8601)" },
        { name: "windowEnd", label: "Window end (ISO 8601)" },
      ];
    case "shopify":
      return [
        { name: "query", label: "Product title search" },
        { name: "orderName", label: "Order name (e.g. #1001) — overrides search" },
      ];
    case "woocommerce":
      return [
        { name: "query", label: "Product search" },
        { name: "orderNumber", label: "Order number — overrides search" },
      ];
    case "delivery_tracking":
      return [{ name: "trackingNumber", label: "Tracking number" }];
    case "custom_inventory":
      return [{ name: "sku", label: "SKU" }];
    default:
      return [];
  }
}
