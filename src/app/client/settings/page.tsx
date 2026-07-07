import { requireUser } from "@/lib/auth";
import { getBrandVoiceProfile } from "@/lib/brand-voice";
import { getChannels, getClient, getKnowledgeSources } from "@/lib/dashboard";
import { AppShell } from "@/components/shell";

export default async function ClientSettingsPage() {
  const user = await requireUser("client");
  if (!user.clientId) {
    throw new Error("Client user is missing a client assignment.");
  }

  const [client, brandVoice, channels, knowledgeSources] = await Promise.all([
    getClient(user.clientId),
    getBrandVoiceProfile(user.clientId),
    getChannels(user.clientId),
    getKnowledgeSources(user.clientId),
  ]);
  if (!client) {
    throw new Error("Client record not found.");
  }

  const location = String(client.business_profile.location ?? "");
  const ownerChatId = String(client.business_profile.ownerChatId ?? "");
  const ownerPhone = String(client.business_profile.ownerPhone ?? "");

  return (
    <AppShell user={user} active="client" clientActive="settings" workspaceName={client.name}>
      <div className="mb-5">
        <h1 className="text-xl font-semibold">Settings</h1>
        <p className="text-sm text-muted">
          Business details and owner contact points Pronto uses for handoffs.
        </p>
      </div>

      <details className="ui-panel">
        <summary className="cursor-pointer list-none ui-panel-header">
          <div>
            <h2 className="text-base font-semibold">Onboarding checklist</h2>
            <p className="text-sm text-muted">Setup items Pronto needs before a full pilot.</p>
          </div>
        </summary>
        <div className="divide-y divide-line">
          <ChecklistRow label="Business location saved" complete={Boolean(location)} />
          <ChecklistRow label="Telegram handoff chat set" complete={Boolean(ownerChatId)} />
          <ChecklistRow label="WhatsApp handoff phone set" complete={Boolean(ownerPhone)} />
          <ChecklistRow label="At least one active channel" complete={channels.some((channel) => channel.status === "active")} />
          <ChecklistRow label="Knowledge sources added" complete={knowledgeSources.length > 0} />
          <ChecklistRow label="Brand voice configured" complete={Boolean(brandVoice.document) || brandVoice.examples.some((example) => example.is_active)} />
        </div>
      </details>

      <section className="mt-6 ui-panel">
        <div className="ui-panel-header">
          <div>
            <h2 className="text-base font-semibold">Owner handoff settings</h2>
            <p className="text-sm text-muted">
              Where Pronto should notify you when a customer needs a human answer.
            </p>
          </div>
        </div>
        <form action="/api/client/settings" method="post" className="space-y-3 p-4">
          <input
            name="location"
            defaultValue={location}
            className="w-full rounded-md border border-line px-3 py-2 text-sm"
            placeholder="Business location"
          />
          <input
            name="ownerChatId"
            defaultValue={ownerChatId}
            className="w-full rounded-md border border-line px-3 py-2 text-sm"
            placeholder="Owner Telegram chat ID"
          />
          <input
            name="ownerPhone"
            defaultValue={ownerPhone}
            className="w-full rounded-md border border-line px-3 py-2 text-sm"
            placeholder="Owner WhatsApp phone number"
          />
          <button className="ui-primary-button px-4 py-2">
            Save settings
          </button>
        </form>
      </section>
    </AppShell>
  );
}

function ChecklistRow({
  label,
  complete,
}: {
  label: string;
  complete: boolean;
}) {
  return (
    <div className="flex items-center gap-3 p-4 text-sm">
      <input type="checkbox" checked={complete} readOnly className="h-4 w-4 rounded border-line" />
      <span className={complete ? "text-foreground" : "text-muted"}>{label}</span>
    </div>
  );
}
