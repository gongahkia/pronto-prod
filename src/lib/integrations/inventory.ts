import { resolveIntegrationCredential } from "@/lib/integrations/credentials";
import type { IntegrationCallResult, IntegrationDefinition } from "@/lib/integrations/types";

export const customInventoryDefinition: IntegrationDefinition = {
  provider: "custom_inventory",
  kind: "inventory",
  label: "Custom inventory",
  description: "Standardized read-only inventory lookup against a per-client JSON endpoint. Use this when the client has a bespoke inventory backend rather than Shopify or WooCommerce.",
  accessMode: "read_only",
  credentialFields: [
    { name: "api_key", label: "API key or bearer token", secret: true, required: true },
    { name: "endpoint_url", label: "Endpoint URL with {sku} placeholder", secret: false, required: true },
    { name: "auth_header", label: "Auth header name (default Authorization)", secret: false, required: false },
    { name: "auth_scheme", label: "Auth scheme prefix (e.g. Bearer)", secret: false, required: false },
  ],
  escalateOn: ["stock_adjust", "price_change", "out_of_catalog"],
};

export type InventoryItem = {
  sku: string;
  name: string | null;
  in_stock: boolean | null;
  quantity: number | null;
  raw: unknown;
};

export async function fetchInventoryItem(input: {
  clientId: string;
  sku: string;
  fetchFn?: typeof fetch;
}): Promise<IntegrationCallResult<InventoryItem | null>> {
  const credential = await resolveIntegrationCredential({
    clientId: input.clientId,
    provider: "custom_inventory",
  });
  if (!credential) {
    return { data: null, warning: "Custom inventory credentials not configured." };
  }

  const endpointTemplate = stringMetadata(credential.metadata, "endpoint_url");
  if (!endpointTemplate || !endpointTemplate.includes("{sku}")) {
    return {
      data: null,
      warning: "endpoint_url metadata missing or does not contain {sku} placeholder.",
    };
  }

  const url = endpointTemplate.replace("{sku}", encodeURIComponent(input.sku));
  const authHeader = stringMetadata(credential.metadata, "auth_header") ?? "Authorization";
  const scheme = stringMetadata(credential.metadata, "auth_scheme");
  const headerValue = scheme ? `${scheme} ${credential.apiKey}` : credential.apiKey;

  const fetchImpl = input.fetchFn ?? fetch;
  const response = await fetchImpl(url, { headers: { [authHeader]: headerValue } });

  if (response.status === 404) {
    return { data: null, warning: null };
  }
  if (!response.ok) {
    return { data: null, warning: `Custom inventory lookup failed: HTTP ${response.status}` };
  }

  const body = (await response.json()) as Record<string, unknown>;
  const quantity = body.quantity;
  return {
    data: {
      sku: input.sku,
      name: pickString(body, ["name", "title", "product_name"]),
      in_stock: typeof body.in_stock === "boolean" ? body.in_stock : null,
      quantity: typeof quantity === "number" ? quantity : null,
      raw: body,
    },
    warning: null,
  };
}

function stringMetadata(meta: Record<string, unknown>, key: string): string | null {
  const value = meta[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function pickString(body: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = body[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return null;
}
