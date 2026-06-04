import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function OperatorClientEscalationsRedirectPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;
  redirect(`/operator/clients/${clientId}/conversations`);
}
