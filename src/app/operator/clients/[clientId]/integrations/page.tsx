import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getClient } from "@/lib/dashboard";
import {
  listIntegrationCredentialStatuses,
} from "@/lib/integrations/credentials";
import { listIntegrationDefinitions } from "@/lib/integrations";
import { credentialEncryptionConfigured } from "@/lib/llm/credentials";
import { AppShell } from "@/components/shell";
import {
  OperatorClientHeader,
  OperatorClientNav,
} from "@/components/operator/operator-nav";
import { IntegrationsPanel } from "@/components/integrations-panel";

export const dynamic = "force-dynamic";

export default async function OperatorClientIntegrationsPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const user = await requireUser("operator");
  const { clientId } = await params;
  const [client, credentials] = await Promise.all([
    getClient(clientId),
    listIntegrationCredentialStatuses(clientId),
  ]);
  if (!client) {
    notFound();
  }

  return (
    <AppShell user={user} active="operator">
      <OperatorClientHeader
        client={client}
        description="Manage non-LLM integration credentials and test live calls."
      />
      <OperatorClientNav clientId={client.id} active="channels" />

      <IntegrationsPanel
        clientId={client.id}
        definitions={listIntegrationDefinitions()}
        credentials={credentials}
        encryptionConfigured={credentialEncryptionConfigured()}
      />
    </AppShell>
  );
}
