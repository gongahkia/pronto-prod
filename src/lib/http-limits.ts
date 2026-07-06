export const MAX_WEBHOOK_BODY_BYTES = 128 * 1024;
export const MAX_TEXT_CHARS = 4000;

export function isBodyWithinLimit(
  body: string,
  maxBytes = MAX_WEBHOOK_BODY_BYTES,
): boolean {
  return Buffer.byteLength(body, "utf8") <= maxBytes;
}

export function isTextWithinLimit(
  text: string,
  maxChars = MAX_TEXT_CHARS,
): boolean {
  return text.length <= maxChars;
}
