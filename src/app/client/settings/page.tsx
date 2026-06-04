import { requireUser } from "@/lib/auth";
import { getAgentConfigDetail } from "@/lib/agent/config";
import { getClient, getMetrics } from "@/lib/dashboard";
import { AppShell } from "@/components/shell";
import { ClientNav } from "@/components/client-nav";
import { StatCard } from "@/components/stat-card";
import { ClientAgentConfigPreview } from "@/components/agent-config-panels";

export const dynamic = "force-dynamic";

export default async function ClientSettingsPage() {
  const user = await requireUser("client");
  if (!user.clientId) {
    throw new Error("Client user is missing a client assignment.");
  }

  const [client, metrics, agentConfig] = await Promise.all([
    getClient(user.clientId),
    getMetrics(user.clientId),
    getAgentConfigDetail(user.clientId),
  ]);
  if (!client) {
    throw new Error("Client record not found.");
  }

  return (
    <AppShell user={user} active="client">
      <div className="mb-5">
        <h1 className="text-xl font-semibold tracking-[-0.01em]">{client.name}</h1>
        <p className="text-sm text-muted">Manage notifications and service setup.</p>
      </div>
      <ClientNav active="settings" />

      <section className="grid gap-4 md:grid-cols-4">
        <StatCard label="Conversations" value={metrics.conversations} />
        <StatCard label="Escalation rate" value={`${Math.round(metrics.escalationRate * 100)}%`} />
        <StatCard label="Actionable escalations" value={metrics.openEscalations} />
        <StatCard label="CSAT" value="Pending" hint="Client-facing collection hook" />
      </section>

      <section className="mt-6 ui-panel">
        <div className="ui-panel-header">
          <h2 className="text-base font-semibold">Notification settings</h2>
        </div>
        <form action="/api/client/settings" method="post" className="space-y-3 p-4">
          <input
            name="location"
            defaultValue={String(client.business_profile.location ?? "")}
            className="w-full rounded-md border border-line px-3 py-2 text-sm"
            placeholder="Business location"
          />
          <input
            name="ownerChatId"
            defaultValue={String(client.business_profile.ownerChatId ?? "")}
            className="w-full rounded-md border border-line px-3 py-2 text-sm"
            placeholder="Owner Telegram chat ID"
          />
          <input
            name="ownerPhone"
            defaultValue={String(client.business_profile.ownerPhone ?? "")}
            className="w-full rounded-md border border-line px-3 py-2 text-sm"
            placeholder="Owner WhatsApp phone number"
          />
          <button className="ui-primary-button px-4 py-2">
            Save settings
          </button>
        </form>
      </section>

      <ClientAgentConfigPreview detail={agentConfig} />
    </AppShell>
  );
}
