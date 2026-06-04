import { describe, expect, it, vi } from "vitest";
import { crawlWebsiteKnowledge } from "@/lib/knowledge/website";

describe("website knowledge crawler", () => {
  it("extracts static same-origin HTML pages within limits", async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url === "https://north.example/robots.txt") {
        return textResponse("User-agent: *\nDisallow: /private", "text/plain");
      }
      if (url === "https://north.example/") {
        return textResponse(
          `
            <html>
              <head><title>North Bridge Nasi</title><style>.x{}</style></head>
              <body>
                <script>window.secret = true</script>
                <h1>North Bridge Nasi</h1>
                <p>Open daily from 10 AM to 10 PM.</p>
                <a href="/menu">Menu</a>
                <a href="/private">Private</a>
                <a href="https://other.example/">Other</a>
              </body>
            </html>
          `,
        );
      }
      if (url === "https://north.example/menu") {
        return textResponse("<h1>Menu</h1><p>Nasi Lemak Bowl is SGD 12.80.</p>");
      }
      if (url === "https://north.example/private") {
        return textResponse("<h1>Private rooms</h1><p>No private karaoke rooms.</p>");
      }
      throw new Error(`Unexpected URL ${url}`);
    });

    const result = await crawlWebsiteKnowledge({
      url: "https://north.example/",
      crawlDepth: 1,
      maxPages: 3,
      fetchImpl: fetchImpl as typeof fetch,
    });

    expect(result.title).toBe("North Bridge Nasi");
    expect(result.content).toContain("Open daily from 10 AM to 10 PM.");
    expect(result.content).toContain("Nasi Lemak Bowl is SGD 12.80.");
    expect(result.content).toContain("No private karaoke rooms.");
    expect(result.content).not.toContain("window.secret");
    expect(result.metadata.crawledPages).toEqual([
      "https://north.example/",
      "https://north.example/menu",
      "https://north.example/private",
    ]);
    expect(result.metadata.warnings).toContain("robots.txt may disallow /private.");
  });

  it("rejects non-http website URLs", async () => {
    await expect(
      crawlWebsiteKnowledge({ url: "file:///tmp/menu.html" }),
    ).rejects.toThrow("http:// or https://");
  });
});

function textResponse(body: string, contentType = "text/html"): Response {
  return new Response(body, {
    status: 200,
    headers: { "content-type": contentType },
  });
}
