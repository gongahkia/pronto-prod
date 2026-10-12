import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getAssistantDraft } from "@/lib/assistant-drafts";
import { getBrandVoiceProfile } from "@/lib/brand-voice";
import { getChannels, getClient, getKnowledgeSources } from "@/lib/dashboard";
import { getTriageFlowForClient } from "@/lib/triage-flow-store";
import { AppShell } from "@/components/shell";
import { AssistantTester } from "@/components/assistant-tester";
import { Badge } from "@/components/badge";
import { ClientAssistantNav } from "@/components/client-assistant-nav";

export default async function ClientAssistantPage({
  searchParams,
}: {
  searchParams?: Promise<{ published?: string; error?: string }>;
}) {
  const user = await requireUser("client");
  if (!user.clientId) throw new Error("Client user is missing a client assignment.");
  const [client, channels, knowledge, flow, voice, draft, params] = await Promise.all([
    getClient(user.clientId),
    getChannels(user.clientId),
    getKnowledgeSources(user.clientId),
    getTriageFlowForClient(user.clientId),
    getBrandVoiceProfile(user.clientId),
    getAssistantDraft(user.clientId),
    searchParams ?? Promise.resolve({} as { published?: string; error?: string }),
  ]);
  if (!client) throw new Error("Client record not found.");
  const testChannels = [
    { id: "preview", kind: "whatsapp" as const, name: "General preview", status: "draft" as const },
    ...channels
      .filter((channel) => channel.status !== "disabled")
      .map(({ id, kind, name, status }) => ({ id, kind, name, status })),
  ];
  const unpublishedCount = (draft?.voice ? 1 : 0)
    + (draft?.flow ? 1 : 0)
    + Object.keys(draft?.knowledge_changes ?? {}).length;
  const setup = [
    { label: "Knowledge", detail: "Answers your assistant can use", done: knowledge.length > 0, href: "/client/knowledge", required: true },
    { label: "Customer channel", detail: "Where replies are sent", done: channels.some((channel) => channel.status === "active"), href: "/client/assistant/channels", required: true },
    { label: "Brand voice", detail: "How replies should sound", done: Boolean(voice.document?.content), href: "/client/assistant/voice", required: false },
    { label: "Handoff rules", detail: "When a person should take over", done: !flow.isDefault, href: "/client/assistant/rules", required: false },
  ];

  return (
    <AppShell user={user} active="client" clientActive="assistant" workspaceName={client.name}>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Test & publish</h1>
          <p className="text-sm text-muted">Ask a customer question to check the answer before changes reach customers.</p>
        </div>
        <Badge tone={draft ? "amber" : "green"}>
          {draft ? `${unpublishedCount} unpublished change${unpublishedCount === 1 ? "" : "s"}` : "All changes published"}
        </Badge>
      </div>
      <ClientAssistantNav active="overview" />
      {params.published ? (
        <p role="status" className="mb-4 rounded-md border border-success/30 bg-success-bg p-3 text-sm text-success">
          Revision {params.published} is live.
        </p>
      ) : null}
      {params.error ? (
        <p role="alert" className="mb-4 rounded-md border border-danger/30 bg-danger-bg p-3 text-sm text-danger">
          {params.error === "conflict"
            ? "The live assistant changed while this draft was open. Discard the draft, then review the latest settings before editing again."
            : params.error}
        </p>
      ) : null}

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-5">
          {draft ? (
            <section className="ui-panel p-4">
              <h2 className="font-semibold">Changes waiting to go live</h2>
              <p className="mt-1 text-sm text-muted">
                Test a customer question below. The test uses your draft; real customer replies still use the live version.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Link href="/client/approvals" className="ui-primary-button px-4 py-2">
                  Review approval status
                </Link>
                <DiscardDraftButton />
              </div>
            </section>
          ) : null}
          <AssistantTester channels={testChannels} clientName={client.name} />
        </div>
        <div className="space-y-5">
          <section className="ui-panel">
            <div className="ui-panel-header"><h2 className="font-semibold">Before customers write in</h2></div>
            <ul className="divide-y divide-line">
              {setup.map((item) => (
                <li key={item.label}>
                  <Link href={item.href} className="flex items-center justify-between gap-3 p-4 text-sm hover:bg-surface-hover">
                    <span><span className="block font-medium">{item.label}</span><span className="block text-xs text-muted">{item.detail}</span></span>
                    <Badge tone={item.done ? "green" : item.required ? "amber" : "neutral"}>{item.done ? "Added" : item.required ? "Needed" : "Optional"}</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
          <section className="ui-panel p-4 text-sm">
            <h2 className="font-semibold">Current setup</h2>
            <p className="mt-2 text-muted">{knowledge.length} knowledge sources · {channels.filter((channel) => channel.status === "active").length} active channels</p>
            <p className="mt-1 text-muted">Handoff rules: {flow.isDefault ? "standard" : "custom"}</p>
          </section>
        </div>
      </div>
    </AppShell>
  );
}

function DiscardDraftButton() {
  return (
    <form action="/api/client/assistant/discard" method="post">
      <button className="ui-button px-4 py-2">Discard draft</button>
    </form>
  );
}
