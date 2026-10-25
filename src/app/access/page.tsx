import { requireUser } from "@/lib/auth";
import { AccountAccess } from "@/components/account-access";

export default async function AccessPage({ searchParams }: { searchParams: Promise<{ reason?: string }> }) {
  const user = await requireUser();
  return <AccountAccess user={user} reason={(await searchParams).reason ?? "business-role"}/>;
}
