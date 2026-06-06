"use client";

import { useState } from "react";
import { Play } from "lucide-react";
import { selectableFreeProviders } from "@/lib/llm/free-providers";

type TestState =
  | { status: "idle"; message: string }
  | { status: "testing"; message: string }
  | { status: "success"; message: string }
  | { status: "error"; message: string };

export function ProviderTestConsole({
  initialProvider,
  initialModel,
}: {
  initialProvider: string;
  initialModel: string;
}) {
  const [provider, setProvider] = useState(initialProvider);
  const [model, setModel] = useState(initialModel);
  const [apiKey, setApiKey] = useState("");
  const [state, setState] = useState<TestState>({
    status: "idle",
    message: "Send a synthetic grounded-answer request before using a free provider live.",
  });

  async function testProvider() {
    setState({ status: "testing", message: "Testing provider" });
    const response = await fetch("/api/operator/provider-test", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ provider, model, apiKey }),
    });
    const payload = (await response.json()) as {
      ok?: boolean;
      error?: string;
      model?: string;
      decision?: { action?: string; reasonCode?: string };
    };
    if (!response.ok || !payload.ok) {
      setState({
        status: "error",
        message: payload.error ?? "Provider test failed.",
      });
      return;
    }
    setApiKey("");
    setState({
      status: "success",
      message: `${payload.model ?? model} returned ${payload.decision?.action ?? "a decision"} (${payload.decision?.reasonCode ?? "ok"}).`,
    });
  }

  return (
    <div className="border-t border-line p-4">
      <div className="mb-3">
        <h3 className="text-sm font-semibold">Provider test</h3>
        <p className="text-xs text-muted">{state.message}</p>
      </div>
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <label className="block space-y-2 text-sm font-medium">
          <span>Provider</span>
          <select
            value={provider}
            onChange={(event) => setProvider(event.target.value)}
            className="w-full rounded-md border border-line px-3 py-2 text-sm font-normal"
          >
            <option value="mock">Mock local</option>
            <option value="openai">OpenAI</option>
            <option value="azure">Azure OpenAI</option>
            <option value="anthropic">Anthropic</option>
            {selectableFreeProviders().map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.priority === "no-key" ? "No-key: " : "Free: "}
                {candidate.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-2 text-sm font-medium">
          <span>Model</span>
          <input
            value={model}
            onChange={(event) => setModel(event.target.value)}
            className="w-full rounded-md border border-line px-3 py-2 text-sm font-normal"
          />
        </label>
      </div>
      <label className="mt-3 block space-y-2 text-sm font-medium">
        <span>Temporary or saved API key</span>
        <input
          value={apiKey}
          onChange={(event) => setApiKey(event.target.value)}
          type="password"
          autoComplete="off"
          className="w-full rounded-md border border-line px-3 py-2 text-sm font-normal"
          placeholder="Optional: saves/replaces the selected provider key when PRONTO_SECRETS_KEY is set"
        />
      </label>
      <button
        className="ui-primary-button mt-3 gap-2 px-4 py-2 disabled:cursor-not-allowed disabled:opacity-60"
        type="button"
        disabled={state.status === "testing"}
        onClick={testProvider}
      >
        <Play size={15} />
        Test provider
      </button>
    </div>
  );
}
