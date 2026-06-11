import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveIntegrationCredential: vi.fn(),
}));

vi.mock("@/lib/integrations/credentials", () => ({
  resolveIntegrationCredential: mocks.resolveIntegrationCredential,
}));

import {
  fetchDeliveryTracking,
  fetchInventoryItem,
  fetchShopifyOrderStatus,
} from "@/lib/integrations";

afterEach(() => {
  vi.resetAllMocks();
});

describe("integration adapters", () => {
  it("returns a warning when credentials are missing", async () => {
    mocks.resolveIntegrationCredential.mockResolvedValue(null);
    const result = await fetchShopifyOrderStatus({
      clientId: "client-1",
      orderName: "#1001",
    });
    expect(result.data).toBeNull();
    expect(result.warning).toMatch(/not configured/i);
  });

  it("builds the Shopify order request URL from credential metadata", async () => {
    mocks.resolveIntegrationCredential.mockResolvedValue({
      apiKey: "token",
      metadata: { shop_domain: "acme.myshopify.com", api_version: "2024-10" },
    });
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ orders: [{ id: 1, order_number: 1001 }] }),
    });
    const result = await fetchShopifyOrderStatus({
      clientId: "client-1",
      orderName: "#1001",
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    expect(result.data?.order_number).toBe(1001);
    expect(fetchFn).toHaveBeenCalledWith(
      expect.stringContaining("acme.myshopify.com/admin/api/2024-10/orders.json"),
      expect.any(Object),
    );
  });

  it("substitutes the SKU placeholder for inventory lookups", async () => {
    mocks.resolveIntegrationCredential.mockResolvedValue({
      apiKey: "token",
      metadata: { endpoint_url: "https://example.com/items/{sku}" },
    });
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ name: "Widget", in_stock: true, quantity: 5 }),
    });
    const result = await fetchInventoryItem({
      clientId: "client-1",
      sku: "ABC-123",
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    expect(result.data?.in_stock).toBe(true);
    expect(fetchFn).toHaveBeenCalledWith(
      "https://example.com/items/ABC-123",
      expect.any(Object),
    );
  });

  it("rejects delivery tracking endpoints without the placeholder", async () => {
    mocks.resolveIntegrationCredential.mockResolvedValue({
      apiKey: "token",
      metadata: { endpoint_url: "https://example.com/track" },
    });
    const result = await fetchDeliveryTracking({
      clientId: "client-1",
      trackingNumber: "X1",
    });
    expect(result.warning).toMatch(/tracking_number/);
  });
});
