import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getChannels } from "@/lib/dashboard";
import { getBusinessReplySettings } from "@/lib/knowledge/reply-settings";
import { listChannelDrafts } from "@/lib/client-channel-drafts";
import { AppShell } from "@/components/shell";
import { KnowledgeInformationCard } from "@/components/knowledge-information-card";
import { BusinessChannelsCard, type KnowledgeChannelParams } from "@/components/business-channels-card";
import { BrandVoiceCard, HandoffRulesCard } from "@/components/business-reply-settings";

type PageSearch = KnowledgeChannelParams & { updated?: string; staged?: string; submitted?: string;
  published?: string; error?: string; section?: string };

export default async function ClientKnowledgePage({ searchParams }: { searchParams?: Promise<PageSearch> }) {
  const user = await requireUser("client");
  if (!user.clientId) throw new Error("Business assignment required.");
  const params = await searchParams ?? {};
  if (params.section === "voice") redirect("/client/knowledge/brand-voice");
  if (params.section === "rules") redirect("/client/knowledge/handoff-rules");
  if (params.channel || params.section === "channels") {
    const query = new URLSearchParams();
    for (const key of ["channel", "saved", "checked", "channelPublished", "channelError"] as const) if (params[key]) query.set(key, params[key]!);
    redirect(`/client/knowledge/channels${query.size ? `?${query}` : ""}`);
  }
  const [settings, channels, channelDrafts] = await Promise.all([
    getBusinessReplySettings(user.clientId), getChannels(user.clientId), listChannelDrafts(user.clientId),
  ]);
  return <AppShell user={user} active="client" clientActive="knowledge" workspaceName={settings.client.name}>
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-2xl font-semibold">Business Knowledge</h1>
      <p className="mt-1 text-sm text-muted">Manage what Pronto knows, how it replies and when your team steps in.</p></div>
      {settings.draft && <Link href="/client/approvals" className="ui-button px-3 py-2 text-sm">Review pending changes</Link>}</div>
    {params.updated || params.staged || params.submitted ? <p role="status" className="mb-4 rounded-md bg-success-bg p-3 text-sm text-success">Saved for review. Customer answers have not changed.</p> : null}
    {params.published && <p role="status" className="mb-4 rounded-md bg-success-bg p-3 text-sm text-success">Revision {params.published} is live.</p>}
    {params.error && <p role="alert" className="mb-4 rounded-md bg-danger-bg p-3 text-sm text-danger">{params.error === "conflict"
      ? "The live assistant changed. Review the latest settings before editing again." : params.error}</p>}
    <div className="space-y-5">
      <KnowledgeInformationCard client={settings.client}/>
      <div className="grid items-start gap-5 lg:grid-cols-2"><BusinessChannelsCard channels={channels} drafts={channelDrafts}/><BrandVoiceCard settings={settings}/></div>
      <HandoffRulesCard settings={settings}/>
    </div>
  </AppShell>;
}
