import { requireUser } from "@/lib/auth";
import { formatDate as formatDisplayDate } from "@/lib/date-format";
import { getChannels, getClient } from "@/lib/dashboard";
import { getTriageFlowForClient } from "@/lib/triage-flow-store";
import { AppShell } from "@/components/shell";
import { AssistantTester } from "@/components/assistant-tester";
import { Badge } from "@/components/badge";

export default async function ClientAssistantPage() {
  const user = await requireUser("client");
  if (!user.clientId) {
    throw new Error("Client user is missing a client assignment.");
  }

  const [client, channels, flow] = await Promise.all([
    getClient(user.clientId),
    getChannels(user.clientId),
    getTriageFlowForClient(user.clientId),
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
          </div>
        </section>

        <AssistantTester channels={testChannels} clientName={client.name} />
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
