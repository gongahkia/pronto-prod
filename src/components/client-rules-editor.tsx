"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  TRIAGE_DECISIONS,
  TRIAGE_CHANNEL_COPY,
  type TriageFlowDraft,
  type TriageFlowNode,
  type TriageDecisionKey,
} from "@/lib/triage-flow";
import type { ChannelKind } from "@/lib/types";

const channels = Object.keys(TRIAGE_CHANNEL_COPY) as ChannelKind[];

export function ClientRulesEditor({ initialFlow }: { initialFlow: TriageFlowDraft }) {
  const router = useRouter();
  const [flow, setFlow] = useState(initialFlow);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");

  function updateDecision(key: TriageDecisionKey, update: Partial<TriageFlowNode["data"]>) {
    setFlow((current) => ({
      ...current,
      nodes: current.nodes.map((node) => node.data.decisionKey === key
        ? { ...node, data: { ...node.data, ...update } }
        : node),
    }));
  }

  function updateChannel(key: TriageDecisionKey, channel: ChannelKind, enabled: boolean | undefined, terms: string[]) {
    const node = flow.nodes.find((item) => item.data.decisionKey === key);
    if (!node) return;
    updateDecision(key, {
      channelOverrides: {
        ...node.data.channelOverrides,
        [channel]: {
          ...(enabled === undefined ? {} : { enabled }),
          ...(terms.length ? { triggerTerms: terms } : {}),
        },
      },
    });
  }

  async function save() {
    setSaving(true);
    setStatus("");
    try {
      const response = await fetch("/api/client/assistant/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "flow", nodes: flow.nodes, edges: flow.edges }),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Could not save rules.");
      setStatus("Rules saved as a draft. Preview an answer in Test & publish before publishing.");
      router.refresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not save rules.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="rounded-md border border-line bg-surface p-4 text-sm text-muted">
        Pronto answers from approved knowledge when it can. These rules tell it when to hand a conversation to your team.
      </p>
      {TRIAGE_DECISIONS.map((decision) => {
        const node = flow.nodes.find((item) => item.data.decisionKey === decision.decisionKey);
        if (!node) return null;
        return (
          <section key={decision.decisionKey} className="ui-panel p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold">{decision.label}</h2>
                <p className="mt-1 text-sm text-muted">{decision.description}</p>
              </div>
              <label className="flex items-center gap-2 text-sm font-medium">
                <input type="checkbox" checked={node.data.enabled !== false}
                  onChange={(event) => updateDecision(decision.decisionKey, { enabled: event.target.checked })} />
                Hand off
              </label>
            </div>
            <label className="mt-4 block text-sm font-medium">
              Words or phrases that should trigger this rule
              <textarea rows={2} className="ui-input mt-1 w-full px-3 py-2 font-normal"
                value={(node.data.triggerTerms ?? []).join(", ")}
                onChange={(event) => updateDecision(decision.decisionKey, {
                  triggerTerms: splitTerms(event.target.value),
                })} />
            </label>
            <details className="mt-4 text-sm">
              <summary className="cursor-pointer font-medium text-accent">Channel-specific behavior</summary>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                {channels.map((channel) => {
                  const override = node.data.channelOverrides?.[channel];
                  return (
                    <div key={channel} className="rounded-md border border-line p-3">
                      <p className="font-medium">{channelLabel(channel)}</p>
                      <label className="mt-2 block text-xs text-muted">
                        Behavior
                        <select className="ui-input mt-1 w-full px-2 py-1 text-sm"
                          value={override?.enabled === undefined ? "default" : override.enabled ? "handoff" : "answer"}
                          onChange={(event) => updateChannel(
                            decision.decisionKey,
                            channel,
                            event.target.value === "default" ? undefined : event.target.value === "handoff",
                            override?.triggerTerms ?? [],
                          )}>
                          <option value="default">Use main rule</option>
                          <option value="handoff">Hand off</option>
                          <option value="answer">Allow an answer</option>
                        </select>
                      </label>
                      <label className="mt-2 block text-xs text-muted">
                        Extra channel phrases
                        <input className="ui-input mt-1 w-full px-2 py-1 text-sm"
                          value={(override?.triggerTerms ?? []).join(", ")}
                          onChange={(event) => updateChannel(
                            decision.decisionKey, channel, override?.enabled, splitTerms(event.target.value),
                          )} />
                      </label>
                    </div>
                  );
                })}
              </div>
            </details>
          </section>
        );
      })}
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="ui-primary-button px-4 py-2" disabled={saving} onClick={save}>
          {saving ? "Saving..." : "Save rules draft"}
        </button>
        <span role="status" className="text-sm text-muted">{status}</span>
      </div>
    </div>
  );
}

function splitTerms(value: string): string[] {
  return value.split(",").map((term) => term.trim()).filter(Boolean);
}

function channelLabel(channel: ChannelKind): string {
  return channel[0].toUpperCase() + channel.slice(1);
}
