import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { canViewBusinessConversation } from "@/lib/staff-permissions";

export default async function ClientHomePage() {
  const user = await requireUser("client");
  if (!user.clientId) redirect("/access?reason=membership");
  redirect(await canViewBusinessConversation(user, user.clientId) ? "/client/inbox" : "/client/knowledge");
}
