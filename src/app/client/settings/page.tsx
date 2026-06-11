import { requireUser } from "@/lib/auth";
import { getBrandVoiceProfile } from "@/lib/brand-voice";
import { getClient } from "@/lib/dashboard";
import { AppShell } from "@/components/shell";
import { ClientBrandVoicePreview } from "@/components/local-release-panels";

export default async function ClientSettingsPage() {
  const user = await requireUser("client");
  if (!user.clientId) {
    throw new Error("Client user is missing a client assignment.");
  }

  const [client, brandVoice] = await Promise.all([
    getClient(user.clientId),
    getBrandVoiceProfile(user.clientId),
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

      <section className="grid gap-4 md:grid-cols-3">
        <InfoCard label="Business" value={client.name} detail={location || "No location saved"} />
        <InfoCard label="Telegram handoff" value={ownerChatId || "Not set"} detail="Owner notification chat" />
        <InfoCard label="WhatsApp handoff" value={ownerPhone || "Not set"} detail="Owner notification phone" />
      </section>

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

      <ClientBrandVoicePreview profile={brandVoice} />
    </AppShell>
  );
}

function InfoCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="ui-panel p-6">
      <p className="text-sm font-medium leading-[18px] text-muted">{label}</p>
      <p className="mt-3 truncate text-[20px] font-normal leading-6 text-foreground">{value}</p>
      <p className="mt-1 text-sm text-muted">{detail}</p>
    </div>
  );
}
