import { requireUser } from "@/lib/auth";
import { getAssistantDraft } from "@/lib/assistant-drafts";
import { getClient } from "@/lib/dashboard";
import { getTriageFlowForClient } from "@/lib/triage-flow-store";
import { AppShell } from "@/components/shell";
import { ClientAssistantNav } from "@/components/client-assistant-nav";
import { ClientRulesEditor } from "@/components/client-rules-editor";

export default async function ClientRulesPage() {
  const user = await requireUser("client");
  if (!user.clientId) throw new Error("Client user is missing a client assignment.");
  const [client, liveFlow, draft] = await Promise.all([
    getClient(user.clientId), getTriageFlowForClient(user.clientId), getAssistantDraft(user.clientId),
  ]);
  if (!client) throw new Error("Client record not found.");
  return (
    <AppShell user={user} active="client" clientActive="assistant" workspaceName={client.name}>
      <div className="mb-5">
        <h1 className="text-xl font-semibold">Handoff rules</h1>
        <p className="text-sm text-muted">Choose when Pronto should ask your team to take over.</p>
      </div>
      <ClientAssistantNav active="rules" />
      <ClientRulesEditor initialFlow={draft?.flow ?? { nodes: liveFlow.nodes, edges: liveFlow.edges }} />
    </AppShell>
  );
}
