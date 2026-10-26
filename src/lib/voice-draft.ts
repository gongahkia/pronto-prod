import { z } from "zod";
import { compileVoiceStyle, voiceTones, voiceLengths, VOICE_EXAMPLE_LIMIT, VOICE_SAVED_EXAMPLE_LIMIT,
  VOICE_GUIDE_MAX_LENGTH, VOICE_EXAMPLE_QUESTION_MAX_LENGTH, VOICE_EXAMPLE_REPLY_MAX_LENGTH, VOICE_EXAMPLE_NOTES_MAX_LENGTH } from "@/lib/voice-style";

const schema = z.object({ title: z.string().trim().min(1).max(100),
  content: z.string().trim().min(1).max(VOICE_GUIDE_MAX_LENGTH),
  attributes: z.record(z.string(), z.unknown()).optional(), sourceNotes: z.string().max(2000).nullable().optional(),
  examples: z.array(z.object({ customerMessage: z.string().trim().min(1).max(VOICE_EXAMPLE_QUESTION_MAX_LENGTH),
    idealResponse: z.string().trim().min(1).max(VOICE_EXAMPLE_REPLY_MAX_LENGTH),
    notes: z.string().trim().max(VOICE_EXAMPLE_NOTES_MAX_LENGTH), active: z.boolean() })).max(VOICE_SAVED_EXAMPLE_LIMIT),
});

export function normalizeVoiceDraft(value: unknown) {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new Error("Use a guide name of up to 100 characters, a style guide of up to 1,600 characters, and examples within the displayed limits.");
  const voice = parsed.data;
  if (voice.examples.filter(example => example.active).length > VOICE_EXAMPLE_LIMIT)
    throw new Error(`Select at most ${VOICE_EXAMPLE_LIMIT} style examples for model replies.`);
  if (voice.attributes?.style !== undefined) {
    const style = z.object({ tone: z.enum(Object.keys(voiceTones) as [keyof typeof voiceTones, ...Array<keyof typeof voiceTones>]),
      length: z.enum(Object.keys(voiceLengths) as [keyof typeof voiceLengths, ...Array<keyof typeof voiceLengths>]) }).strict().safeParse(voice.attributes.style);
    if (!style.success) throw new Error("Choose a supported tone and reply length.");
    if (voice.attributes.promptMode !== "custom") voice.content = compileVoiceStyle(style.data);
    voice.attributes = { ...voice.attributes, demoDefault: false };
  }
  if (voice.attributes?.promptMode === "custom") voice.attributes = { ...voice.attributes, demoDefault: false };
  return voice;
}
