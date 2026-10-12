import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getClient } from "@/lib/dashboard";
import { AppShell } from "@/components/shell";

export default async function ClientSettingsPage() {
  const user = await requireUser("client");
  if (!user.clientId) {
    throw new Error("Client user is missing a client assignment.");
  }

  const client = await getClient(user.clientId);
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

      <section className="ui-panel">
        <div className="ui-panel-header">
          <div>
            <h2 className="text-base font-semibold">Owner handoff settings</h2>
            <p className="text-sm text-muted">
              Where Pronto should notify you when a customer needs a human answer.
            </p>
          </div>
        </div>
        <form action="/api/client/settings" method="post" className="space-y-3 p-4">
          <label className="block text-sm font-medium">Business location
            <input name="location" defaultValue={location} className="ui-input mt-1 block w-full px-3 py-2" placeholder="Address customers should see" />
          </label>
          <label className="block text-sm font-medium">Team Telegram chat ID
            <input name="ownerChatId" defaultValue={ownerChatId} className="ui-input mt-1 block w-full px-3 py-2" placeholder="Optional" />
          </label>
          <label className="block text-sm font-medium">Team WhatsApp number
            <input name="ownerPhone" type="tel" defaultValue={ownerPhone} className="ui-input mt-1 block w-full px-3 py-2" placeholder="Optional, with country code" />
          </label>
          <button className="ui-primary-button px-4 py-2">
            Save settings
          </button>
        </form>
      </section>
      <p className="mt-4 text-sm text-muted">
        Review your assistant in <Link className="text-accent" href="/client/assistant">Test &amp; publish</Link>.
      </p>
    </AppShell>
  );
}
