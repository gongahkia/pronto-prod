import { requireUser } from "@/lib/auth";
import { formatDate as formatDisplayDate } from "@/lib/date-format";
import { getChannels, getClient } from "@/lib/dashboard";
import { getClientAssistantChangeRequests } from "@/lib/client-assistant-requests";
import { getTriageFlowForClient } from "@/lib/triage-flow-store";
import { AppShell } from "@/components/shell";
import { AssistantTester } from "@/components/assistant-tester";
import { Badge } from "@/components/badge";

export default async function ClientAssistantPage() {
  const user = await requireUser("client");
  if (!user.clientId) {
    throw new Error("Client user is missing a client assignment.");
  }

  const [client, channels, flow, assistantRequests] = await Promise.all([
    getClient(user.clientId),
    getChannels(user.clientId),
    getTriageFlowForClient(user.clientId),
    getClientAssistantChangeRequests(user.clientId, 8),
  ]);
  if (!client) {
    throw new Error("Client record not found.");
  }

  const testChannels = channels
    .filter((channel) => channel.status !== "disabled")
    .map((channel) => ({
      id: channel.id,
      kind: channel.kind,
      name: channel.name,
      status: channel.status,
    }));

  return (
    <AppShell user={user} active="client" clientActive="assistant" workspaceName={client.name}>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Assistant</h1>
          <p className="text-sm text-muted">
            Test how Pronto replies before customers see it.
          </p>
        </div>
        <Badge tone={flow.isDefault ? "amber" : "green"}>
          {flow.isDefault ? "Default rules" : `Published v${flow.version}`}
        </Badge>
      </div>

      <section className="grid gap-6 xl:grid-cols-[0.36fr_0.64fr]">
        <section className="ui-panel">
          <div className="ui-panel-header">
            <div>
              <h2 className="text-base font-semibold">Assistant config</h2>
              <p className="text-sm text-muted">
                Current published behavior for this workspace.
              </p>
            </div>
          </div>
          <div className="divide-y divide-line text-sm">
            <div className="flex items-center justify-between gap-4 p-4">
              <span className="text-muted">Last published</span>
              <span className="font-medium">{formatDate(flow.publishedAt)}</span>
            </div>
            <div className="flex items-center justify-between gap-4 p-4">
              <span className="text-muted">Configured channels</span>
              <span className="font-medium">{testChannels.length}</span>
            </div>
            <div className="flex items-center justify-between gap-4 p-4">
              <span className="text-muted">Change requests</span>
              <span className="font-medium">
                {assistantRequests.filter((request) => request.status === "open" || request.status === "reviewing").length}
              </span>
            </div>
          </div>
        </section>

        <AssistantTester channels={testChannels} clientName={client.name} />
      </section>

      <section className="mt-6">
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
