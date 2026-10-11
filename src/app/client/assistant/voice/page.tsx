import { requireUser } from "@/lib/auth";
import { getAssistantDraft, type VoiceDraft } from "@/lib/assistant-drafts";
import { getBrandVoiceProfile } from "@/lib/brand-voice";
import { getClient } from "@/lib/dashboard";
import { AppShell } from "@/components/shell";
import { ClientAssistantNav } from "@/components/client-assistant-nav";
import { ClientVoiceEditor } from "@/components/client-voice-editor";

export default async function ClientVoicePage() {
  const user = await requireUser("client");
  if (!user.clientId) throw new Error("Client user is missing a client assignment.");
  const [client, profile, draft] = await Promise.all([
    getClient(user.clientId),
    getBrandVoiceProfile(user.clientId),
    getAssistantDraft(user.clientId),
  ]);
  if (!client) throw new Error("Client record not found.");
  const live: VoiceDraft = {
    title: profile.document?.title ?? "Brand voice guide",
    content: profile.document?.content ?? client.brand_voice,
    examples: profile.examples.map((example) => ({
      customerMessage: example.customer_message,
      idealResponse: example.ideal_response,
      notes: example.notes ?? "",
      active: example.is_active,
    })),
  };
  return (
    <AppShell user={user} active="client" clientActive="assistant" workspaceName={client.name}>
      <div className="mb-5">
        <h1 className="text-xl font-semibold">Brand voice</h1>
        <p className="text-sm text-muted">Guide the tone of Pronto&apos;s answers with a style guide and real examples.</p>
      </div>
      <ClientAssistantNav active="voice" />
      <ClientVoiceEditor initialVoice={draft?.voice ?? live} />
    </AppShell>
  );
}
