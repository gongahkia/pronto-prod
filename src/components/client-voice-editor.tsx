"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import type { VoiceDraft } from "@/lib/assistant-drafts";
import { useDraftEditor } from "@/components/use-draft-editor";
import { compileVoiceStyle, voiceStyleFromAttributes, voiceTones, voiceLengths, VOICE_EXAMPLE_LIMIT, VOICE_SAVED_EXAMPLE_LIMIT,
  VOICE_EXAMPLE_QUESTION_MAX_LENGTH, VOICE_EXAMPLE_REPLY_MAX_LENGTH, VOICE_EXAMPLE_NOTES_MAX_LENGTH, type VoiceStyle } from "@/lib/voice-style";
import { VOICE_GUIDE_MAX_LENGTH } from "@/lib/voice-style";

export function ClientVoiceEditor({ initialVoice, initialVersion = 0, embedded = false }: {
  initialVoice: VoiceDraft; initialVersion?: number; embedded?: boolean;
}) {
  const router = useRouter();
  const promptId = useId();
  const editor = useDraftEditor(initialVoice, initialVersion);
  const voice = editor.value;
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);
  const style = voiceStyleFromAttributes(voice.attributes);
  const selected = voice.examples.filter(example => example.active).length;

  function updateStyle(next: VoiceStyle) {
    editor.setValue({ ...voice, attributes: { ...voice.attributes, style: next, promptMode: "custom" } });
  }
  async function save() {
    setSaving(true); setStatus("");
    try {
      const response = await fetch("/api/client/assistant/draft", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "voice", voice, expectedVersion: editor.version }) });
      const body = await response.json() as { error?: string; version: number };
      if (!response.ok) throw new Error(body.error ?? "Could not save reply style.");
      editor.saved(body.version);
      setStatus("Draft saved. Replies keep using the current style until this draft is approved and published.");
      router.refresh();
    } catch (error) { setStatus(error instanceof Error ? error.message : "Could not save reply style."); }
    finally { setSaving(false); }
  }
  return <fieldset disabled={saving} className="min-w-0 space-y-5">
    <div className={embedded ? "space-y-4" : "ui-panel space-y-4 p-5"}>
      <p className="text-sm leading-6 text-muted">Choose how replies sound. Business facts belong in Knowledge; conditions for involving your team belong in Handoff rules.</p>
      <label className="block text-sm font-medium">Guide name
        <input className="ui-input mt-1 w-full px-3 py-2" maxLength={100} value={voice.title}
          onChange={event => editor.setValue({ ...voice, title: event.target.value })}/>
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm font-medium">Tone
          <select className="ui-input mt-1 w-full px-3 py-2" value={voice.attributes?.style ? style.tone : ""}
            onChange={event => updateStyle({ ...style, tone: event.target.value as VoiceStyle["tone"] })}>
            <option value="" disabled>Choose a tone</option>
            {Object.entries(voiceTones).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
        </label>
        <label className="block text-sm font-medium">Reply length
          <select className="ui-input mt-1 w-full px-3 py-2" value={voice.attributes?.style ? style.length : ""}
            onChange={event => updateStyle({ ...style, length: event.target.value as VoiceStyle["length"] })}>
            <option value="" disabled>Choose a reply length</option>
            {Object.entries(voiceLengths).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-3"><button type="button" disabled={!voice.attributes?.style}
        className="ui-button px-3 py-2 text-sm" onClick={() => editor.setValue({ ...voice, content: compileVoiceStyle(style), attributes: { ...voice.attributes, style, promptMode: "custom" } })}>Use presets as prompt</button>
        <p className="text-xs text-muted">Replaces the prompt below with the selected tone and length.</p></div>
      <div><label htmlFor={promptId} className="block text-sm font-medium">Custom brand prompt</label>
        <textarea className="ui-input mt-2 w-full px-3 py-3 font-mono text-sm font-normal leading-6" rows={7}
          id={promptId} aria-describedby={`${promptId}-help`}
          maxLength={VOICE_GUIDE_MAX_LENGTH} value={voice.content}
          onChange={event => editor.setValue({ ...voice, content: event.target.value, attributes: { ...voice.attributes, promptMode: "custom" } })}
          placeholder="Describe how your business speaks: preferred language, phrasing, greetings, formality and words to avoid."/>
        <span id={`${promptId}-help`} className="mt-1 flex flex-wrap justify-between gap-2 text-xs font-normal text-muted"><span>Saved exactly as written for the model’s brand voice instructions. Knowledge and handoff policies still apply.</span><span>{voice.content.length}/{VOICE_GUIDE_MAX_LENGTH}</span></span>
      </div>
    </div>
    <section className={embedded ? "border-t border-line pt-5" : "ui-panel p-5"}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-semibold">Style examples</h3>
        <button type="button" className="ui-button px-3 py-2" disabled={voice.examples.length >= VOICE_SAVED_EXAMPLE_LIMIT}
          onClick={() => editor.setValue({ ...voice, examples: [...voice.examples, { customerMessage: "", idealResponse: "", notes: "", active: selected < VOICE_EXAMPLE_LIMIT }] })}>Add example</button>
      </div>
      <p className="mt-2 text-sm leading-6 text-muted">{selected} selected · select up to {VOICE_EXAMPLE_LIMIT} per reply; keep up to {VOICE_SAVED_EXAMPLE_LIMIT} saved examples. Examples guide wording. Answers still need approved business knowledge.</p>
      <div className="mt-4 space-y-4">
        {!voice.examples.length && <p className="text-sm text-muted">Add a customer question and an example of the tone you prefer.</p>}
        {voice.examples.map((example, index) => <div key={index} className="space-y-3 rounded-md border border-line p-4">
          <div className="flex items-center justify-between gap-3"><p className="text-sm font-medium">Example {index + 1}</p>
            <button type="button" className="text-sm text-danger" onClick={() => editor.setValue({ ...voice, examples: voice.examples.filter((_, itemIndex) => itemIndex !== index) })}>Remove</button></div>
          <label className="block text-sm font-medium">Customer question
            <textarea className="ui-input mt-1 w-full px-3 py-2 font-normal" rows={2} maxLength={VOICE_EXAMPLE_QUESTION_MAX_LENGTH} value={example.customerMessage}
              onChange={event => updateExample(index, "customerMessage", event.target.value)}/>
            <span className="text-xs font-normal text-muted">{example.customerMessage.length}/{VOICE_EXAMPLE_QUESTION_MAX_LENGTH} characters</span>
          </label>
          <label className="block text-sm font-medium">Preferred wording
            <textarea className="ui-input mt-1 w-full px-3 py-2 font-normal" rows={3} maxLength={VOICE_EXAMPLE_REPLY_MAX_LENGTH} value={example.idealResponse}
              onChange={event => updateExample(index, "idealResponse", event.target.value)}/>
            <span className="text-xs font-normal text-muted">{example.idealResponse.length}/{VOICE_EXAMPLE_REPLY_MAX_LENGTH} characters</span>
          </label>
          <label className="block text-sm font-medium">Style notes (optional)
            <input className="ui-input mt-1 w-full px-3 py-2" maxLength={VOICE_EXAMPLE_NOTES_MAX_LENGTH} value={example.notes}
              onChange={event => updateExample(index, "notes", event.target.value)}/>
          </label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={example.active}
            disabled={!example.active && selected >= VOICE_EXAMPLE_LIMIT} onChange={event => updateExample(index, "active", event.target.checked)}/>Include in reply style</label>
        </div>)}
      </div>
    </section>
    <div className="flex flex-wrap items-center gap-3">
      <button type="button" className="ui-primary-button px-4 py-2" disabled={!editor.dirty || saving} onClick={save}>{saving ? "Saving…" : "Save style draft"}</button>
      {editor.dirty && <><button type="button" className="ui-button px-3 py-2" onClick={() => { editor.reset(); setStatus(""); }}>Discard edits</button><span className="text-xs text-warning">Unsaved changes</span></>}
      <Link href="/client/approvals" className="text-sm text-accent">Review saved changes</Link>
    </div>
    <p role="status" className="text-sm leading-6 text-muted">{status}</p>
  </fieldset>;

  function updateExample(index: number, field: keyof VoiceDraft["examples"][number], value: string | boolean) {
    editor.setValue({ ...voice, examples: voice.examples.map((example, itemIndex) => itemIndex === index ? { ...example, [field]: value } : example) });
  }
}
