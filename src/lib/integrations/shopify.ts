import { resolveIntegrationCredential } from "@/lib/integrations/credentials";
import type { IntegrationCallResult, IntegrationDefinition } from "@/lib/integrations/types";

export const shopifyDefinition: IntegrationDefinition = {
  provider: "shopify",
  kind: "commerce",
  label: "Shopify",
  description: "Read-only product catalog and order status. Refunds and order modifications must escalate to a human.",
  accessMode: "read_only",
  credentialFields: [
    { name: "admin_api_token", label: "Admin API access token", secret: true, required: true },
    { name: "shop_domain", label: "Shop domain (e.g. acme.myshopify.com)", secret: false, required: true },
    { name: "api_version", label: "Admin API version (default 2024-10)", secret: false, required: false },
  ],
  escalateOn: ["refund_request", "order_modify", "order_cancel", "address_change"],
};

export type ShopifyProductSummary = {
  id: number;
  title: string;
  handle: string;
  status: string;
};

export type ShopifyOrderStatus = {
  id: number;
  order_number: number;
  financial_status: string | null;
  fulfillment_status: string | null;
};

export async function searchShopifyProducts(input: {
  clientId: string;
  query: string;
  limit?: number;
  fetchFn?: typeof fetch;
}): Promise<IntegrationCallResult<ShopifyProductSummary[]>> {
  const credential = await resolveIntegrationCredential({
    clientId: input.clientId,
    provider: "shopify",
  });
  if (!credential) {
    return { data: null, warning: "Shopify credentials not configured." };
  }

  const shop = stringMetadata(credential.metadata, "shop_domain");
  const version = stringMetadata(credential.metadata, "api_version") ?? "2024-10";
  if (!shop) {
    return { data: null, warning: "shop_domain missing in integration metadata." };
  }

  const limit = Math.min(Math.max(input.limit ?? 10, 1), 50);
  const params = new URLSearchParams({ limit: String(limit), title: input.query });
  const fetchImpl = input.fetchFn ?? fetch;
  const response = await fetchImpl(
    `https://${shop}/admin/api/${version}/products.json?${params.toString()}`,
    { headers: { "X-Shopify-Access-Token": credential.apiKey } },
  );

  if (!response.ok) {
    return { data: null, warning: `Shopify product search failed: HTTP ${response.status}` };
  }

  const body = (await response.json()) as { products?: ShopifyProductSummary[] };
  return { data: body.products ?? [], warning: null };
}

export async function fetchShopifyOrderStatus(input: {
  clientId: string;
  orderName: string;
  fetchFn?: typeof fetch;
}): Promise<IntegrationCallResult<ShopifyOrderStatus | null>> {
  const credential = await resolveIntegrationCredential({
    clientId: input.clientId,
    provider: "shopify",
  });
  if (!credential) {
    return { data: null, warning: "Shopify credentials not configured." };
  }

  const shop = stringMetadata(credential.metadata, "shop_domain");
  const version = stringMetadata(credential.metadata, "api_version") ?? "2024-10";
  if (!shop) {
    return { data: null, warning: "shop_domain missing in integration metadata." };
  }

  const params = new URLSearchParams({
    name: input.orderName,
    status: "any",
    fields: "id,order_number,financial_status,fulfillment_status",
  });
  const fetchImpl = input.fetchFn ?? fetch;
  const response = await fetchImpl(
    `https://${shop}/admin/api/${version}/orders.json?${params.toString()}`,
    { headers: { "X-Shopify-Access-Token": credential.apiKey } },
  );

  if (!response.ok) {
    return { data: null, warning: `Shopify order status failed: HTTP ${response.status}` };
  }

  const body = (await response.json()) as { orders?: ShopifyOrderStatus[] };
  return { data: body.orders?.[0] ?? null, warning: null };
}

function stringMetadata(meta: Record<string, unknown>, key: string): string | null {
  const value = meta[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
