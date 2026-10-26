import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
export default async function ClientRulesPage() {
  await requireUser("client");
  redirect("/client/knowledge?section=rules#handoff-rules");
}
