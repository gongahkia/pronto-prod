import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getClient } from "@/lib/dashboard";
import { localStaffCommandsEnabled } from "@/lib/staff-interaction";
import { AppShell } from "@/components/shell";
import { StaffCommandPanel } from "@/components/staff-command-panel";

export const dynamic = "force-dynamic";

export default async function ContactProntoPage() {
  if (!localStaffCommandsEnabled()) notFound();
  const user = await requireUser("client");
  if (!user.clientId) notFound();
  const client = await getClient(user.clientId);
  if (!client) notFound();
  return <AppShell user={user} active="client" clientActive="channels" workspaceName={client.name}>
    <Link href="/client/channels" className="text-sm text-accent">Back to Connected Channels</Link>
    <h1 className="mb-4 mt-2 text-2xl font-semibold">Contact Pronto</h1>
    <StaffCommandPanel/>
  </AppShell>;
}
