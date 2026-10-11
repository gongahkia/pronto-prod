import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";

export default async function ClientEscalationsPage() {
  const user = await requireUser("client");
  if (!user.clientId) redirect("/login");
  redirect("/client/inbox?status=needs_reply");
}
