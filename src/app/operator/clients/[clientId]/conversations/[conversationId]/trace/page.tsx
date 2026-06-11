import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { formatDateTime } from "@/lib/date-format";
import { getClient } from "@/lib/dashboard";
import { getConversationTrace } from "@/lib/trace";
import { AppShell } from "@/components/shell";
import {
  OperatorClientHeader,
  OperatorClientNav,
} from "@/components/operator/operator-nav";

export default async function OperatorConversationTracePage({
  params,
}: {
  params: Promise<{ clientId: string; conversationId: string }>;
}) {
  const user = await requireUser("operator");
  const { clientId, conversationId } = await params;
  const [client, trace] = await Promise.all([
    getClient(clientId),
    getConversationTrace(conversationId),
  ]);
  if (!client || !trace || trace.clientId !== clientId) {
    notFound();
  }

  return (
    <AppShell user={user} active="operator">
      <OperatorClientHeader
        client={client}
        description="Inspect the per-conversation agent trace for debugging model decisions, retrieval, and cost."
      />
      <OperatorClientNav clientId={client.id} active="conversations" />

      <div className="mb-4 text-sm">
        <Link
          href={`/operator/clients/${client.id}/conversations/${conversationId}`}
          className="text-accent"
        >
          ← Back to conversation
        </Link>
      </div>

      <section className="ui-panel">
        <div className="ui-panel-header">
          <h2 className="text-base font-semibold">Trace totals</h2>
        </div>
        <div className="grid gap-3 p-4 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label="Agent runs" value={String(trace.totals.agentRuns)} />
          <Stat label="Provider calls" value={String(trace.totals.providerCalls)} />
          <Stat label="Input tokens" value={String(trace.totals.inputTokens)} />
          <Stat label="Output tokens" value={String(trace.totals.outputTokens)} />
          <Stat
            label="Est. cost (USD)"
            value={trace.totals.estimatedCostUsd.toFixed(6)}
          />
          <Stat
            label="Avg latency"
            value={
              trace.totals.avgLatencyMs === null
                ? "—"
                : `${Math.round(trace.totals.avgLatencyMs)} ms`
            }
          />
        </div>
      </section>

      {trace.agentTraces.length > 0 && (
        <section className="ui-panel mt-6">
          <div className="ui-panel-header">
            <h2 className="text-base font-semibold">Agent runs</h2>
          </div>
          <ul className="divide-y divide-line">
            {trace.agentTraces.map((run) => (
              <li key={run.id} className="px-4 py-3 text-sm">
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                  <div className="font-mono text-xs uppercase tracking-wide text-muted">
                    {run.status} · {run.reason_code ?? "—"}
                  </div>
                  <time className="font-mono text-xs text-muted" dateTime={run.created_at.toISOString()}>
                    {formatDateTime(run.created_at)}
                  </time>
                </div>
                <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <span className="text-muted">Provider:</span>{" "}
                    {run.response_provider ?? "—"}/{run.response_model ?? "—"}
                  </div>
                  <div>
                    <span className="text-muted">Embedding:</span>{" "}
                    {run.embedding_provider ?? "—"}/{run.embedding_model ?? "—"}
                  </div>
                  <div>
                    <span className="text-muted">Top score:</span>{" "}
                    {run.retrieval_top_score === null
                      ? "—"
                      : run.retrieval_top_score.toFixed(4)}{" "}
                    / threshold{" "}
                    {run.retrieval_threshold === null
                      ? "—"
                      : run.retrieval_threshold.toFixed(4)}
                  </div>
                  <div>
                    <span className="text-muted">Latency:</span>{" "}
                    {run.latency_ms === null ? "—" : `${run.latency_ms} ms`}
                  </div>
                  <div>
                    <span className="text-muted">Confidence:</span>{" "}
                    {run.confidence === null ? "—" : run.confidence.toFixed(2)}
                  </div>
                  <div>
                    <span className="text-muted">Chunks:</span>{" "}
                    {run.retrieval_chunk_count} retrieved,{" "}
                    {run.cited_chunk_ids.length} cited
                  </div>
                  {run.prompt_hash && (
                    <div className="font-mono text-xs">
                      <span className="text-muted">Prompt hash:</span>{" "}
                      {run.prompt_hash.slice(0, 12)}…
                    </div>
                  )}
                  {run.used_failover && (
                    <div className="text-warning">
                      Failover → {run.failover_provider}/{run.failover_model}
                    </div>
                  )}
                </div>
                {run.error_message && (
                  <p className="mt-2 text-danger">{run.error_message}</p>
                )}
                {run.steps.length > 0 && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs text-accent">
                      {run.steps.length} steps
                    </summary>
                    <ol className="mt-2 space-y-1 text-xs">
                      {run.steps.map((step, index) => (
                        <li key={index} className="font-mono">
                          <span className="text-muted">{step.at}</span>{" "}
                          <span className="font-semibold">{step.label}</span>
                          {step.detail && (
                            <span className="text-muted">
                              {" "}
                              {JSON.stringify(step.detail)}
                            </span>
                          )}
                        </li>
                      ))}
                    </ol>
                  </details>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="ui-panel mt-6">
        <div className="ui-panel-header">
          <h2 className="text-base font-semibold">Timeline</h2>
        </div>
        <ol className="divide-y divide-line">
          {mergedEvents(trace).map((event) => (
            <li key={event.key} className="px-4 py-3 text-sm">
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-mono text-xs uppercase tracking-wide text-muted">
                  {event.label}
                </span>
                <time className="font-mono text-xs text-muted" dateTime={event.at.toISOString()}>
                  {formatDateTime(event.at)}
                </time>
              </div>
              <div className="mt-1 whitespace-pre-wrap text-sm">{event.body}</div>
              {event.meta && (
                <pre className="mt-2 overflow-x-auto rounded bg-surface p-2 text-xs">
                  {event.meta}
                </pre>
              )}
            </li>
          ))}
        </ol>
      </section>

      {trace.reviews.length > 0 && (
        <section className="ui-panel mt-6">
          <div className="ui-panel-header">
            <h2 className="text-base font-semibold">QA reviews</h2>
          </div>
          <ul className="divide-y divide-line">
            {trace.reviews.map((review) => (
              <li key={review.id} className="px-4 py-3 text-sm">
                <div className="flex flex-wrap gap-3">
                  <span>Hallucination: {review.hallucination ? "yes" : "no"}</span>
                  <span>
                    Escalation needed:{" "}
                    {review.escalation_was_needed === null
                      ? "unknown"
                      : review.escalation_was_needed
                        ? "yes"
                        : "no"}
                  </span>
                  {review.csat !== null && <span>CSAT: {review.csat}</span>}
                </div>
                {review.notes && (
                  <p className="mt-1 whitespace-pre-wrap">{review.notes}</p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </AppShell>
  );
}

type MergedEvent = {
  key: string;
  label: string;
  at: Date;
  body: string;
  meta?: string;
};

function mergedEvents(trace: Awaited<ReturnType<typeof getConversationTrace>>): MergedEvent[] {
  if (!trace) return [];
  const events: MergedEvent[] = [];

  for (const message of trace.messages) {
    events.push({
      key: `msg:${message.id}`,
      label: `message:${message.sender_role}`,
      at: message.created_at,
      body: message.body,
      meta: hasMeta(message.metadata) ? safeStringify(message.metadata) : undefined,
    });
  }

  for (const event of trace.providerEvents) {
    events.push({
      key: `provider:${event.id}`,
      label: `provider:${event.operation}`,
      at: event.created_at,
      body: `${event.provider}/${event.model} — in ${event.input_tokens}t, out ${event.output_tokens}t, $${event.estimated_cost_usd.toFixed(6)}`,
      meta: hasMeta(event.metadata) ? safeStringify(event.metadata) : undefined,
    });
  }

  for (const escalation of trace.escalations) {
    events.push({
      key: `escalation:${escalation.id}`,
      label: `escalation:${escalation.status}`,
      at: escalation.created_at,
      body: `${escalation.reason_code} — ${escalation.reason_detail}${
        escalation.confidence !== null
          ? ` (confidence ${escalation.confidence.toFixed(2)})`
          : ""
      }`,
    });
  }

  return events.sort((a, b) => a.at.getTime() - b.at.getTime());
}

function hasMeta(meta: Record<string, unknown>): boolean {
  return meta && Object.keys(meta).length > 0;
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return "[unserializable]";
  }
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-line bg-surface px-3 py-2">
      <div className="text-xs uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-1 text-lg font-semibold">{value}</div>
    </div>
  );
}
