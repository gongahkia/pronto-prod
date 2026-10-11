import { describe, expect, it, vi } from "vitest";

const fakes = vi.hoisted(() => ({
  resolveIntegrationCredential: vi.fn(async ({ provider }: { provider: string }) =>
    ["shopify", "delivery_tracking"].includes(provider) ? { apiKey: "fake", metadata: {} } : null),
  fetchShopifyOrderStatus: vi.fn(async () => ({
    data: { id: 1, order_number: 1001, financial_status: "paid", fulfillment_status: "shipped" },
    warning: null,
  })),
  fetchDeliveryTracking: vi.fn(async () => ({
    data: { tracking_number: "ABC123XYZ789", status: "out for delivery", last_event_at: null },
    warning: null,
  })),
}));
vi.mock("@/lib/integrations/credentials", () => ({
  resolveIntegrationCredential: fakes.resolveIntegrationCredential,
}));
vi.mock("@/lib/integrations", () => ({
  fetchShopifyOrderStatus: fakes.fetchShopifyOrderStatus,
  fetchDeliveryTracking: fakes.fetchDeliveryTracking,
  fetchWooCommerceOrderStatus: vi.fn(),
  fetchInventoryItem: vi.fn(),
  fetchGoogleCalendarBusy: vi.fn(),
  fetchCalendlyAvailability: vi.fn(),
}));

import { runIntegrationsForMessage } from "@/lib/agent/integration-tools";

describe("known private lookup defect: future acceptance specification", () => {
  it("D: withholds another customer's order and tracking status without requester verification", async () => {
    fakes.fetchShopifyOrderStatus.mockClear();
    fakes.fetchDeliveryTracking.mockClear();
    const results = await runIntegrationsForMessage({
      clientId: "business-1",
      message: "Check order #1001 and tracking number ABC123XYZ789",
    });
    // The current interface has no verified customer identity or order ownership input.
    expect(results).toEqual([]);
    expect(fakes.fetchShopifyOrderStatus).not.toHaveBeenCalled();
    expect(fakes.fetchDeliveryTracking).not.toHaveBeenCalled();
  });
});
