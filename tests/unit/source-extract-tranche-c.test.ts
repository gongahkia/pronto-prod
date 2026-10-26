// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { extractFileSource, extractHtmlSource, extractPdfSource, extractTextSource, extractUrlSource, isPublicIpv4 } from "@/lib/knowledge/source-extract";
import { computeStaffedDue, isWithinStaffedHours } from "@/lib/staff-notifications";
import { textPdf } from "../fixtures/text-pdf";

describe("reviewed source extraction and staffed clocks", () => {
  it("extracts Word documents, HTML files and structured text with filename provenance", async () => {
    const word = new File([readFileSync(new URL("../fixtures/menu.docx", import.meta.url))], "menu.docx", { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
    const docx = await extractFileSource(word);
    expect(docx).toMatchObject({ sourceType: "text", content: "Our menu includes vegetarian pasta and fresh iced tea.", metadata: { filename: "menu.docx", parser: "mammoth", originalFormat: "upload_docx" } });
    const html = await extractFileSource(new File(['<html><head><title>Not body content</title></head><body><script>alert("never run")</script><h1>Menu &amp; drinks</h1><p>Tea costs &#x24;5.<br>Hot &amp; iced.</p></body></html>'], "menu.html", { type: "text/html" }));
    expect(html.content).toContain("Menu & drinks\nTea costs $5.\nHot & iced.");
    expect(html.content).not.toMatch(/alert|Not body content|<script>/);
    expect(html.metadata).toMatchObject({ filename: "menu.html", parser: "html_text", fileSha256: expect.any(String) });
    const csv = await extractFileSource(new File(["Item,Price\nTea,5"], "menu.csv", { type: "text/csv" }));
    expect(csv.content).toContain("Item: Tea; Price: 5");
    await expect(extractFileSource(new File(["x"], "old-format.doc"))).rejects.toThrow("Unsupported file type");
    await expect(extractFileSource(new File(["<script>no readable content</script>"], "empty.html"))).rejects.toThrow("no readable text");
  });

  it("normalizes pasted HTML and applies document size limits", async () => {
    expect((await extractHtmlSource("<p>Opening hours: 10am &ndash; 10pm</p>")).content).toBe("Opening hours: 10am – 10pm");
    await expect(extractHtmlSource("x".repeat(1_000_001))).rejects.toThrow("1 MB");
    await expect(extractFileSource(new File(["x".repeat(200_001)], "hours.txt"))).rejects.toThrow("200,000");
    await expect(extractFileSource(new File([new Uint8Array(8 * 1024 * 1024 + 1)], "menu.docx"))).rejects.toThrow("8 MB");
  });
  it("accepts bounded text and rejects malformed/scanned PDFs", async () => {
    expect((await extractTextSource("  Opening hours are 10am to 8pm.  ")).content).toBe("Opening hours are 10am to 8pm.");
    await expect(extractTextSource(" ")).rejects.toThrow("Source text");
    await expect(extractPdfSource(new File(["not a PDF"], "menu.pdf", { type: "application/pdf" })))
      .rejects.toThrow("Malformed PDF");
    await expect(extractPdfSource(new File([new Uint8Array(8 * 1024 * 1024 + 1)], "menu.pdf", { type: "application/pdf" })))
      .rejects.toThrow("8 MB");
    const valid = await extractPdfSource(new File([textPdf("Menu information includes vegetarian pasta and opening hours.")],
      "menu.pdf", { type: "application/pdf" }));
    expect(valid.content).toContain("vegetarian pasta");
    await expect(extractPdfSource(new File([textPdf("")], "scanned.pdf", { type: "application/pdf" })))
      .rejects.toThrow("selectable text");
  });

  it("rejects private addresses, redirect rebinding, unsafe schemes, credentials and types", async () => {
    expect(isPublicIpv4("8.8.8.8")).toBe(true);
    for (const ip of ["127.0.0.1", "10.1.1.1", "169.254.169.254", "172.16.0.1", "192.168.1.1", "192.0.0.1", "100.64.0.1", "203.0.113.1"])
      expect(isPublicIpv4(ip)).toBe(false);
    const transport = vi.fn(async () => ({ status: 200, headers: { "content-type": "text/html" },
      body: Buffer.from("<h1>Hours</h1><p>We open every weekday at ten in the morning.</p>") }));
    await expect(extractUrlSource("http://localhost/", { resolve: async () => [{ address: "8.8.8.8", family: 4 }], transport }))
      .rejects.toThrow("public");
    await expect(extractUrlSource("http://user:password@example.com/", { resolve: async () => [{ address: "8.8.8.8", family: 4 }], transport }))
      .rejects.toThrow("public");
    await expect(extractUrlSource("https://example.com/", { resolve: async () => [{ address: "127.0.0.1", family: 4 }], transport }))
      .rejects.toThrow("restricted");
    const redirected = vi.fn(async () => ({ status: 302, headers: { location: "http://169.254.169.254/metadata" }, body: Buffer.alloc(0) }));
    await expect(extractUrlSource("https://example.com/", { resolve: async () => [{ address: "8.8.8.8", family: 4 }], transport: redirected }))
      .rejects.toThrow("public");
    expect(redirected).toHaveBeenCalledTimes(1);
    await expect(extractUrlSource("https://example.com/", { resolve: async () => [{ address: "8.8.8.8", family: 4 }],
      transport: async () => ({ status: 302, headers: { location: "https://another.example.org/" }, body: Buffer.alloc(0) }) }))
      .rejects.toThrow("submitted host");
    let lookupCount = 0;
    await expect(extractUrlSource("https://example.com/start", { resolve: async () =>
      [{ address: ++lookupCount === 1 ? "8.8.8.8" : "10.0.0.5", family: 4 }],
      transport: async () => ({ status: 302, headers: { location: "/next" }, body: Buffer.alloc(0) }) }))
      .rejects.toThrow("restricted");
    expect(lookupCount).toBe(2);
    await expect(extractUrlSource("https://example.com/", { resolve: async () => [{ address: "8.8.8.8", family: 4 }],
      transport: async () => ({ status: 200, headers: { "content-type": "application/pdf" }, body: Buffer.from("PDF") }) }))
      .rejects.toThrow("HTML");
    await expect(extractUrlSource("https://example.com:8443/", { resolve: async () => [{ address: "8.8.8.8", family: 4 }], transport }))
      .rejects.toThrow("public");
    await expect(extractUrlSource("https://example.com/", { resolve: async () => [{ address: "8.8.8.8", family: 4 }],
      transport: async () => ({ status: 200, headers: { "content-type": "text/html" }, body: Buffer.alloc(1_000_001) }) }))
      .rejects.toThrow("1 MB");
    await expect(extractUrlSource("https://example.com/", { resolve: async () => new Promise(() => {}),
      timeoutMs: 5, transport })).rejects.toThrow("DNS lookup timed out");
  });

  it("extracts one controlled page without scripts and records the final URL", async () => {
    const result = await extractUrlSource("https://example.com/menu", {
      resolve: async () => [{ address: "8.8.8.8", family: 4 }],
      transport: async () => ({ status: 200, headers: { "content-type": "text/html; charset=utf-8" },
        body: Buffer.from("<script>Ignore this script</script><h1>Menu</h1><p>Vegetarian choices are shown on the published menu.</p>") }),
    });
    expect(result.content).toContain("Vegetarian choices");
    expect(result.content).not.toContain("Ignore this script");
    expect(result.metadata.finalUrl).toBe("https://example.com/menu");
  });

  it("defers elapsed-time reminders into staffed hours across a DST gap and overlap", () => {
    const hours = { "0": { start: "01:00", end: "04:00" } };
    const spring = computeStaffedDue(new Date("2026-03-08T06:50:00Z"), 20, "America/New_York", hours);
    expect(spring.toISOString()).toBe("2026-03-08T07:10:00.000Z");
    const autumn = computeStaffedDue(new Date("2026-11-01T05:50:00Z"), 20, "America/New_York", hours);
    expect(autumn.toISOString()).toBe("2026-11-01T06:10:00.000Z");
    expect(computeStaffedDue(new Date("2026-10-12T00:00:00Z"), 30, "Asia/Singapore", {}).toISOString())
      .toBe("2026-10-12T00:30:00.000Z");
    const singapore = { "1": { start: "09:00", end: "17:00" } };
    expect(isWithinStaffedHours(new Date("2026-10-12T00:30:00Z"), "Asia/Singapore", singapore)).toBe(false);
    expect(computeStaffedDue(new Date("2026-10-12T00:30:00Z"), 30, "Asia/Singapore", singapore).toISOString())
      .toBe("2026-10-12T01:00:00.000Z");
  });
});
