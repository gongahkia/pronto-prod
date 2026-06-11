import { resolveIntegrationCredential } from "@/lib/integrations/credentials";
import type { IntegrationCallResult, IntegrationDefinition } from "@/lib/integrations/types";

export const wooCommerceDefinition: IntegrationDefinition = {
  provider: "woocommerce",
  kind: "commerce",
  label: "WooCommerce",
  description: "Read-only product catalog and order status. Refunds and modifications escalate.",
  accessMode: "read_only",
  credentialFields: [
    { name: "consumer_key", label: "Consumer key", secret: true, required: true },
    { name: "consumer_secret", label: "Consumer secret", secret: true, required: true },
    { name: "store_url", label: "Store URL (e.g. https://shop.example.com)", secret: false, required: true },
  ],
  escalateOn: ["refund_request", "order_modify", "order_cancel", "address_change"],
};

export type WooCommerceProductSummary = {
  id: number;
  name: string;
  slug: string;
  status: string;
};

export type WooCommerceOrderStatus = {
  id: number;
  number: string;
  status: string;
};

export async function searchWooCommerceProducts(input: {
  clientId: string;
  query: string;
  limit?: number;
  fetchFn?: typeof fetch;
}): Promise<IntegrationCallResult<WooCommerceProductSummary[]>> {
  const credential = await resolveIntegrationCredential({
    clientId: input.clientId,
    provider: "woocommerce",
  });
  if (!credential) {
    return { data: null, warning: "WooCommerce credentials not configured." };
  }

  const storeUrl = stringMetadata(credential.metadata, "store_url");
  const consumerSecret = stringMetadata(credential.metadata, "consumer_secret");
  if (!storeUrl || !consumerSecret) {
    return { data: null, warning: "store_url or consumer_secret missing in integration metadata." };
  }

  const limit = Math.min(Math.max(input.limit ?? 10, 1), 50);
  const auth = Buffer.from(`${credential.apiKey}:${consumerSecret}`).toString("base64");
  const params = new URLSearchParams({ search: input.query, per_page: String(limit) });
  const fetchImpl = input.fetchFn ?? fetch;
  const response = await fetchImpl(
    `${trimTrailingSlash(storeUrl)}/wp-json/wc/v3/products?${params.toString()}`,
    { headers: { Authorization: `Basic ${auth}` } },
  );

  if (!response.ok) {
    return { data: null, warning: `WooCommerce product search failed: HTTP ${response.status}` };
  }

  return { data: (await response.json()) as WooCommerceProductSummary[], warning: null };
}

export async function fetchWooCommerceOrderStatus(input: {
  clientId: string;
  orderNumber: string;
  fetchFn?: typeof fetch;
}): Promise<IntegrationCallResult<WooCommerceOrderStatus | null>> {
  const credential = await resolveIntegrationCredential({
    clientId: input.clientId,
    provider: "woocommerce",
  });
  if (!credential) {
    return { data: null, warning: "WooCommerce credentials not configured." };
  }

  const storeUrl = stringMetadata(credential.metadata, "store_url");
  const consumerSecret = stringMetadata(credential.metadata, "consumer_secret");
  if (!storeUrl || !consumerSecret) {
    return { data: null, warning: "store_url or consumer_secret missing in integration metadata." };
  }

  const auth = Buffer.from(`${credential.apiKey}:${consumerSecret}`).toString("base64");
  const fetchImpl = input.fetchFn ?? fetch;
  const response = await fetchImpl(
    `${trimTrailingSlash(storeUrl)}/wp-json/wc/v3/orders/${encodeURIComponent(input.orderNumber)}`,
    { headers: { Authorization: `Basic ${auth}` } },
  );

  if (response.status === 404) {
    return { data: null, warning: null };
  }
  if (!response.ok) {
    return { data: null, warning: `WooCommerce order status failed: HTTP ${response.status}` };
  }
  return { data: (await response.json()) as WooCommerceOrderStatus, warning: null };
}

function stringMetadata(meta: Record<string, unknown>, key: string): string | null {
  const value = meta[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function trimTrailingSlash(url: string): string {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}
