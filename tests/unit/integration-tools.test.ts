import { describe, expect, it } from "vitest";
import {
  detectIntegrationIntents,
  integrationResultsToKnowledgeChunks,
} from "@/lib/agent/integration-tools";

describe("integration intent detection", () => {
  it("detects an order lookup", () => {
    const intents = detectIntegrationIntents("can you check the status of order #1001?");
    const shopify = intents.find((intent) => intent.provider === "shopify");
    const woo = intents.find((intent) => intent.provider === "woocommerce");
    expect(shopify?.args.orderName).toBe("#1001");
    expect(woo?.args.orderNumber).toBe("1001");
  });

  it("detects tracking numbers", () => {
    const intents = detectIntegrationIntents(
      "tracking number ABC123XYZ789 not moving for days",
    );
    expect(
      intents.find((intent) => intent.provider === "delivery_tracking")?.args
        .trackingNumber,
    ).toBe("ABC123XYZ789");
  });

  it("detects inventory lookups", () => {
    const intents = detectIntegrationIntents("is sku SKU-12345 still in stock?");
    expect(
      intents.find((intent) => intent.provider === "custom_inventory")?.args.sku,
    ).toBe("SKU-12345");
  });

  it("detects booking intents", () => {
    const intents = detectIntegrationIntents("can I book an appointment next week?");
    expect(intents.find((intent) => intent.provider === "google_calendar")).toBeTruthy();
    expect(intents.find((intent) => intent.provider === "calendly")).toBeTruthy();
  });

  it("returns no intents for unrelated text", () => {
    expect(detectIntegrationIntents("what time do you open today?")).toEqual([]);
  });

  it("renders results into knowledge chunks marked as live", () => {
    const chunks = integrationResultsToKnowledgeChunks("client-1", [
      {
        provider: "shopify",
        summary: "Order #1001 fulfilled",
        data: { id: 1 },
        warning: null,
      },
    ]);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].metadata.live_source).toBe(true);
    expect(chunks[0].score).toBeGreaterThan(0.9);
  });
});
