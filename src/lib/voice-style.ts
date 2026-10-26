// Shared by the editor, save validation and model prompt.
export const VOICE_EXAMPLE_LIMIT = 4;
export const VOICE_SAVED_EXAMPLE_LIMIT = 20;
export const VOICE_GUIDE_MAX_LENGTH = 1600;
export const VOICE_EXAMPLE_QUESTION_MAX_LENGTH = 200;
export const VOICE_EXAMPLE_REPLY_MAX_LENGTH = 500;
export const VOICE_EXAMPLE_NOTES_MAX_LENGTH = 150;

export const voiceTones = {
  courteous: "Courteous and clear",
  warm: "Warm and conversational",
  direct: "Direct and practical",
  formal: "Formal and professional",
} as const;
export const voiceLengths = {
  concise: "Concise",
  balanced: "Balanced",
  detailed: "Detailed when useful",
} as const;
export type VoiceStyle = { tone: keyof typeof voiceTones; length: keyof typeof voiceLengths };

export function voiceStyleFromAttributes(attributes?: Record<string, unknown>): VoiceStyle {
  const value = attributes?.style as Partial<VoiceStyle> | undefined;
  return { tone: value?.tone && value.tone in voiceTones ? value.tone : "courteous",
    length: value?.length && value.length in voiceLengths ? value.length : "concise" };
}

export function compileVoiceStyle(style: VoiceStyle): string {
  const length = { concise: "Keep replies brief while covering the customer's question.",
    balanced: "Use enough detail to answer clearly, with short paragraphs.",
    detailed: "Explain useful detail clearly and avoid unnecessary repetition." }[style.length];
  return `Sound ${voiceTones[style.tone].toLowerCase()}. ${length}`;
}
