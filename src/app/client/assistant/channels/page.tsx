import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
export default async function ClientChannelsPage({ searchParams }: {
  searchParams?: Promise<{ channel?: string; saved?: string; checked?: string; published?: string; error?: string }>;
}) {
  await requireUser("client");
  const params = await searchParams ?? {};
  const query = new URLSearchParams();
  for (const key of ["channel", "saved", "checked"] as const) if (params[key]) query.set(key, params[key]!);
  if (params.published) query.set("channelPublished", params.published);
  if (params.error) query.set("channelError", params.error);
  redirect(`/client/knowledge/channels${query.size ? `?${query}` : ""}`);
}
