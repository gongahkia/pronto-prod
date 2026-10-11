"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { VoiceDraft } from "@/lib/assistant-drafts";

export function ClientVoiceEditor({ initialVoice }: { initialVoice: VoiceDraft }) {
  const router = useRouter();
  const [voice, setVoice] = useState(initialVoice);
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    setStatus("");
    try {
      const response = await fetch("/api/client/assistant/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "voice", voice }),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Could not save voice draft.");
      setStatus("Saved as a draft. Test it in Manage assistant before publishing.");
      router.refresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not save voice draft.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <section className="ui-panel p-5">
        <h2 className="text-base font-semibold">How Pronto should sound</h2>
        <p className="mt-1 text-sm text-muted">Write the style guide in plain language. It stays in draft until you publish.</p>
        <div className="mt-4 space-y-3">
          <label className="block text-sm font-medium">
            Guide title
            <input className="ui-input mt-1 w-full px-3 py-2" value={voice.title}
              onChange={(event) => setVoice({ ...voice, title: event.target.value })} />
          </label>
          <label className="block text-sm font-medium">
            Voice guide
            <textarea className="ui-input mt-1 w-full px-3 py-2 font-normal" rows={8}
              value={voice.content}
              onChange={(event) => setVoice({ ...voice, content: event.target.value })} />
          </label>
        </div>
      </section>
      <section className="ui-panel p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Example replies</h2>
            <p className="mt-1 text-sm text-muted">Show Pronto what a good reply looks like.</p>
          </div>
          <button type="button" className="ui-button px-3 py-2"
            onClick={() => setVoice({ ...voice, examples: [...voice.examples, {
              customerMessage: "", idealResponse: "", notes: "", active: true,
            }] })}>
            Add example
          </button>
        </div>
        <div className="mt-4 space-y-4">
          {voice.examples.length === 0 ? <p className="text-sm text-muted">No examples yet.</p> : null}
          {voice.examples.map((example, index) => (
            <div key={index} className="space-y-3 rounded-md border border-line p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold">Example {index + 1}</p>
                <button type="button" className="text-sm text-danger"
                  onClick={() => setVoice({
                    ...voice, examples: voice.examples.filter((_, itemIndex) => itemIndex !== index),
                  })}>Remove</button>
              </div>
              <label className="block text-sm font-medium">Customer message
                <textarea className="ui-input mt-1 w-full px-3 py-2 font-normal" rows={2}
                  value={example.customerMessage}
                  onChange={(event) => updateExample(index, "customerMessage", event.target.value)} />
              </label>
              <label className="block text-sm font-medium">Ideal reply
                <textarea className="ui-input mt-1 w-full px-3 py-2 font-normal" rows={3}
                  value={example.idealResponse}
                  onChange={(event) => updateExample(index, "idealResponse", event.target.value)} />
              </label>
              <label className="block text-sm font-medium">Notes (optional)
                <input className="ui-input mt-1 w-full px-3 py-2" value={example.notes}
                  onChange={(event) => updateExample(index, "notes", event.target.value)} />
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={example.active}
                  onChange={(event) => updateExample(index, "active", event.target.checked)} />
                Use this example
              </label>
            </div>
          ))}
        </div>
      </section>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="ui-primary-button px-4 py-2" disabled={saving} onClick={save}>
          {saving ? "Saving..." : "Save draft"}
        </button>
        <span role="status" className="text-sm text-muted">{status}</span>
      </div>
    </div>
  );

  function updateExample(index: number, field: keyof VoiceDraft["examples"][number], value: string | boolean) {
    setVoice({
      ...voice,
      examples: voice.examples.map((example, itemIndex) => itemIndex === index
        ? { ...example, [field]: value }
        : example),
    });
  }
}
