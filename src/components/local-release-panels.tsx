import type { BrandVoiceProfile } from "@/lib/brand-voice";
import { Badge } from "@/components/badge";

export function OperatorBrandVoicePanel({
  clientId,
  profile,
  returnTo,
}: {
  clientId: string;
  profile: BrandVoiceProfile;
  returnTo?: string;
}) {
  const document = profile.document;
  const formReturnTo = returnTo ?? `/operator/clients/${clientId}`;

  return (
    <section className="ui-panel">
      <div className="ui-panel-header">
        <h2 className="text-base font-semibold">Brand voice</h2>
        <p className="text-sm text-muted">A style guide and example replies for this business.</p>
      </div>
      <form action="/api/operator/brand-voice" method="post" className="space-y-3 p-4">
        <input type="hidden" name="action" value="update_document" />
        <input type="hidden" name="clientId" value={clientId} />
        <input type="hidden" name="returnTo" value={formReturnTo} />
        <input
          name="title"
          defaultValue={document?.title ?? "Brand voice guide"}
          className="w-full rounded-md border border-line px-3 py-2 text-sm"
        />
        <textarea
          name="content"
          rows={6}
          defaultValue={document?.content ?? ""}
          className="w-full rounded-md border border-line px-3 py-2 text-sm"
        />
        <textarea
          name="attributes"
          rows={5}
          defaultValue={JSON.stringify(document?.attributes ?? {}, null, 2)}
          className="w-full rounded-md border border-line px-3 py-2 font-mono text-xs"
        />
        <input
          name="sourceNotes"
          defaultValue={document?.source_notes ?? ""}
          className="w-full rounded-md border border-line px-3 py-2 text-sm"
          placeholder="Sources used: website, founder writing, past chats"
        />
        <button className="ui-primary-button px-4 py-2">
          Save voice guide
        </button>
      </form>

      <form action="/api/operator/brand-voice" method="post" className="space-y-3 border-t border-line p-4">
        <input type="hidden" name="action" value="build_document" />
        <input type="hidden" name="clientId" value={clientId} />
        <input type="hidden" name="returnTo" value={formReturnTo} />
        <label className="block space-y-2 text-sm font-medium">
          <span>Build from source samples</span>
          <textarea
            name="builderSources"
            rows={4}
            className="w-full rounded-md border border-line px-3 py-2 text-sm font-normal"
            placeholder="Paste website copy, past chats, marketing copy, or founder writing samples"
          />
        </label>
        <button className="ui-button px-3 py-2">
          Build draft
        </button>
      </form>

      <div className="border-t border-line p-4">
        <h3 className="mb-3 text-sm font-semibold">Few-shot examples</h3>
        <form action="/api/operator/brand-voice" method="post" className="mb-4 grid gap-3">
          <input type="hidden" name="action" value="add_example" />
          <input type="hidden" name="clientId" value={clientId} />
          <input type="hidden" name="returnTo" value={formReturnTo} />
          <textarea
            name="customerMessage"
            rows={2}
            className="rounded-md border border-line px-3 py-2 text-sm"
            placeholder="Customer message"
          />
          <textarea
            name="idealResponse"
            rows={3}
            className="rounded-md border border-line px-3 py-2 text-sm"
            placeholder="Ideal Pronto reply"
          />
          <input
            name="notes"
            className="rounded-md border border-line px-3 py-2 text-sm"
            placeholder="Optional notes"
          />
          <button className="ui-button px-3 py-2">
            Add example
          </button>
        </form>

        <div className="divide-y divide-line rounded-md border border-line">
          {profile.examples.length ? (
            profile.examples.map((example) => (
              <div key={example.id} className="space-y-3 p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={example.is_active ? "green" : "neutral"}>
                    {example.is_active ? "active" : "paused"}
                  </Badge>
                  {example.notes ? <span className="text-muted">{example.notes}</span> : null}
                </div>
                <p><span className="font-medium">Customer:</span> {example.customer_message}</p>
                <p className="text-muted"><span className="font-medium text-foreground">Reply:</span> {example.ideal_response}</p>
                <div className="flex flex-wrap gap-2">
                  <form action="/api/operator/brand-voice" method="post">
                    <input type="hidden" name="action" value="toggle_example" />
                    <input type="hidden" name="clientId" value={clientId} />
                    <input type="hidden" name="exampleId" value={example.id} />
                    <input type="hidden" name="isActive" value={example.is_active ? "false" : "true"} />
                    <input type="hidden" name="returnTo" value={formReturnTo} />
                    <button className="ui-button px-3 py-1.5">
                      {example.is_active ? "Pause" : "Activate"}
                    </button>
                  </form>
                  <form action="/api/operator/brand-voice" method="post">
                    <input type="hidden" name="action" value="delete_example" />
                    <input type="hidden" name="clientId" value={clientId} />
                    <input type="hidden" name="exampleId" value={example.id} />
                    <input type="hidden" name="returnTo" value={formReturnTo} />
                    <button className="rounded-md bg-danger px-3 py-1.5 text-sm font-semibold text-white">
                      Delete
                    </button>
                  </form>
                </div>
              </div>
            ))
          ) : (
            <p className="p-3 text-sm text-muted">No examples yet.</p>
          )}
        </div>
      </div>
    </section>
  );
}

export function ClientBrandVoicePreview({ profile }: { profile: BrandVoiceProfile }) {
  if (!profile.document && !profile.examples.length) {
    return null;
  }
  return (
    <section className="mt-6 ui-panel">
      <div className="ui-panel-header">
        <h2 className="text-base font-semibold">Brand voice</h2>
        <p className="text-sm text-muted">Read-only view of Pronto&apos;s current reply style guide.</p>
      </div>
      <div className="space-y-3 p-4 text-sm">
        {profile.document ? (
          <>
            <p className="font-medium">{profile.document.title}</p>
            <p className="whitespace-pre-wrap text-muted">{profile.document.content}</p>
          </>
        ) : null}
        {profile.examples.length ? (
          <div className="rounded-md border border-line">
            {profile.examples.filter((example) => example.is_active).slice(0, 3).map((example) => (
              <div key={example.id} className="border-t border-line p-3 first:border-t-0">
                <p><span className="font-medium">Customer:</span> {example.customer_message}</p>
                <p className="mt-1 text-muted"><span className="font-medium text-foreground">Reply:</span> {example.ideal_response}</p>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}
