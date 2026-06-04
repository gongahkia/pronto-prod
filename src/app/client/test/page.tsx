import { requireUser } from "@/lib/auth";
import { getClient } from "@/lib/dashboard";
import { AppShell } from "@/components/shell";
import { ClientNav } from "@/components/client-nav";
import { PilotConsole } from "@/components/pilot-console";

export const dynamic = "force-dynamic";

export default async function ClientTestPage() {
  const user = await requireUser("client");
  if (!user.clientId) {
    throw new Error("Client user is missing a client assignment.");
  }

  const client = await getClient(user.clientId);
  if (!client) {
    throw new Error("Client record not found.");
  }

  return (
    <AppShell user={user} active="client">
      <div className="mb-5">
        <h1 className="text-xl font-semibold tracking-[-0.01em]">{client.name}</h1>
        <p className="text-sm text-muted">Try customer questions before they go live.</p>
      </div>
      <ClientNav active="test" />
      <PilotConsole clientId={client.id} />
    </AppShell>
  );
}
