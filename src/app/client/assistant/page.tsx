import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
export default async function ClientAssistantPage({ searchParams }: { searchParams?: Promise<{ published?: string; error?: string }> }) {
  await requireUser("client");
  const params = await searchParams ?? {};
  const query = new URLSearchParams({ section: "testing" });
  if (params.published) query.set("published", params.published);
  if (params.error) query.set("error", params.error);
  redirect(`/client/knowledge?${query}#test-publish`);
}
