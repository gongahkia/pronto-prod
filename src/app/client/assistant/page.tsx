import { requireUser } from "@/lib/auth";
import { formatDate as formatDisplayDate } from "@/lib/date-format";
import { getClient } from "@/lib/dashboard";
import { getClientAssistantChangeRequests } from "@/lib/client-assistant-requests";
import { getTriageFlowForClient } from "@/lib/triage-flow-store";
import type { TriageFlowNode } from "@/lib/triage-flow";
import { AppShell } from "@/components/shell";
import { Badge } from "@/components/badge";
import { PilotConsole } from "@/components/pilot-console";
import { StatCard } from "@/components/stat-card";

export default async function ClientAssistantPage() {
  const user = await requireUser("client");
  if (!user.clientId) {
    throw new Error("Client user is missing a client assignment.");
  }

  const [client, flow, assistantRequests] = await Promise.all([
    getClient(user.clientId),
    getTriageFlowForClient(user.clientId),
    getClientAssistantChangeRequests(user.clientId, 8),
  ]);
  if (!client) {
    throw new Error("Client record not found.");
  }

  const handoffRules = flow.nodes.filter(isEnabledDecisionNode);
  const disabledRules = flow.nodes.filter((node) =>
    node.data.kind === "decision" && node.data.enabled === false
  );
  const openRequests = assistantRequests.filter((request) =>
    request.status === "open" || request.status === "reviewing"
  );

  return (
    <AppShell user={user} active="client" clientActive="assistant" workspaceName={client.name}>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Assistant</h1>
          <p className="text-sm text-muted">
            See what Pronto answers, when it asks a human, and test customer questions.
          </p>
        </div>
        <Badge tone={flow.isDefault ? "amber" : "green"}>
          {flow.isDefault ? "Default rules" : `Published v${flow.version}`}
        </Badge>
      </div>

      <section className="grid gap-4 md:grid-cols-3">
        <StatCard label="Human handoff rules" value={handoffRules.length} />
        <StatCard label="Change requests" value={openRequests.length} />
        <StatCard label="Last published" value={formatDate(flow.publishedAt)} />
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <section className="ui-panel">
          <div className="ui-panel-header">
            <div>
              <h2 className="text-base font-semibold">What Pronto will answer</h2>
              <p className="text-sm text-muted">
                Pronto answers only when the question is in scope and backed by approved knowledge.
              </p>
            </div>
          </div>
          <div className="space-y-3 p-4 text-sm">
            <div className="rounded-md border border-line bg-surface p-3">
              <p className="font-medium">Safe customer-service questions</p>
              <p className="mt-1 text-muted">
                Opening hours, menu details, policies, FAQs, and service information that exists in
                your Knowledge page.
              </p>
            </div>
            <div className="rounded-md border border-line bg-surface p-3">
              <p className="font-medium">No guessing</p>
              <p className="mt-1 text-muted">
                If Pronto does not have enough confidence or source material, it asks for human help
                instead of improvising.
              </p>
            </div>
          </div>
        </section>

        <section className="ui-panel">
          <div className="ui-panel-header">
            <div>
              <h2 className="text-base font-semibold">When Pronto asks a human</h2>
              <p className="text-sm text-muted">
                These are the live handoff rules Pronto uses before replying to customers.
              </p>
            </div>
          </div>
          <div className="divide-y divide-line">
            {handoffRules.map((node) => (
              <div key={node.id} className="space-y-2 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium">{node.data.label}</p>
                  <Badge tone="amber">handoff</Badge>
                </div>
                <p className="text-sm text-muted">{node.data.description}</p>
                {node.data.triggerTerms?.length ? (
                  <div className="flex flex-wrap gap-1.5">
                    {node.data.triggerTerms.slice(0, 6).map((term) => (
                      <Badge key={term}>{term}</Badge>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
            {handoffRules.length === 0 ? (
              <p className="p-4 text-sm text-muted">No human handoff rules are enabled.</p>
            ) : null}
          </div>
          {disabledRules.length ? (
            <div className="border-t border-line p-4 text-sm text-muted">
              {disabledRules.length} handoff rule{disabledRules.length === 1 ? " is" : "s are"} currently disabled.
            </div>
          ) : null}
        </section>
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-[1fr_0.8fr]">
        <PilotConsole clientId={client.id} />

        <section className="ui-panel">
          <div className="ui-panel-header">
            <div>
              <h2 className="text-base font-semibold">Request assistant change</h2>
              <p className="text-sm text-muted">
                Ask Pronto to adjust tone, scope, or human handoff behavior.
              </p>
            </div>
          </div>
          <form action="/api/client/assistant-requests" method="post" className="space-y-3 p-4">
            <input type="hidden" name="returnTo" value="/client/assistant" />
            <select name="kind" defaultValue="assistant_change" className="w-full rounded-md border border-line px-3 py-2 text-sm">
              <option value="assistant_change">General assistant change</option>
              <option value="handoff_rule">Human handoff rule</option>
              <option value="tone">Tone or wording</option>
              <option value="scope">What Pronto should answer</option>
              <option value="other">Other</option>
            </select>
            <textarea
              name="body"
              rows={5}
              className="w-full rounded-md border border-line px-3 py-2 text-sm"
              placeholder="Describe what should change and why."
            />
            <button className="ui-primary-button px-4 py-2">
              Send request
            </button>
          </form>

          <div className="divide-y divide-line border-t border-line">
            {assistantRequests.length === 0 ? (
              <p className="p-4 text-sm text-muted">No assistant change requests yet.</p>
            ) : (
              assistantRequests.map((request) => (
                <div key={request.id} className="space-y-2 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={request.status === "resolved" ? "green" : "amber"}>
                        {request.status}
                      </Badge>
                      <p className="text-sm font-medium">{kindLabel(request.kind)}</p>
                    </div>
                    <p className="text-xs text-muted">{formatDate(request.created_at)}</p>
                  </div>
                  <p className="text-sm text-muted">{request.body}</p>
                </div>
              ))
            )}
          </div>
        </section>
      </section>
    </AppShell>
  );
}

function isEnabledDecisionNode(node: TriageFlowNode): boolean {
  return node.data.kind === "decision" && node.data.enabled !== false;
}

function formatDate(value: Date | null): string {
  if (!value) {
    return "Not published";
  }
  return formatDisplayDate(value);
}

function kindLabel(kind: string): string {
  if (kind === "handoff_rule") {
    return "Handoff rule";
  }
  if (kind === "tone") {
    return "Tone";
  }
  if (kind === "scope") {
    return "Answer scope";
  }
  if (kind === "other") {
    return "Other";
  }
  return "Assistant change";
}
