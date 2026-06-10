import { beforeAll, describe, expect, it } from "vitest";
import {
  checkRateLimit,
  isBodyWithinLimit,
  isTextWithinLimit,
  resetRateLimitsForTests,
  useMemoryRateLimitBackendForTests,
} from "@/lib/http-limits";

describe("HTTP limits", () => {
  beforeAll(() => {
    useMemoryRateLimitBackendForTests();
  });

  it("rejects oversized bodies and console text", () => {
    expect(isBodyWithinLimit("abcd", 4)).toBe(true);
    expect(isBodyWithinLimit("abcde", 4)).toBe(false);
    expect(isTextWithinLimit("abcd", 4)).toBe(true);
    expect(isTextWithinLimit("abcde", 4)).toBe(false);
  });

  it("rate limits repeated keys inside the same window", async () => {
    await resetRateLimitsForTests();

    expect((await checkRateLimit("client-1", 2, 1000, 100)).allowed).toBe(true);
    expect((await checkRateLimit("client-1", 2, 1000, 200)).allowed).toBe(true);
    const limited = await checkRateLimit("client-1", 2, 1000, 300);

    expect(limited.allowed).toBe(false);
    expect(limited.retryAfterSeconds).toBe(1);
    expect((await checkRateLimit("client-1", 2, 1000, 1200)).allowed).toBe(true);
  });
});
