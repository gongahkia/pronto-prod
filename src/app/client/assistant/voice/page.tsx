import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
export default async function ClientVoicePage() {
  await requireUser("client");
  redirect("/client/knowledge/brand-voice");
}
