// Request IDs only need to be unique per save attempt; crypto.randomUUID is unavailable on insecure origins.
export function newRequestId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  const bytes = new Uint8Array(16);
  if (c && typeof c.getRandomValues === "function") c.getRandomValues(bytes);
  else for (let i = 0; i < 16; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map(b => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// Reuse the ID while the identical payload is being retried; a changed payload is a different save.
export function createRequestIdTracker() {
  let current: { key: string; id: string } | null = null;
  return {
    idFor(payload: unknown): string {
      const key = JSON.stringify(payload);
      if (current?.key !== key) current = { key, id: newRequestId() };
      return current.id;
    },
    clear() { current = null; },
  };
}
