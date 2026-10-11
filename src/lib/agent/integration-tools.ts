import { resolveIntegrationCredential } from "@/lib/integrations/credentials";
import {
  fetchCalendlyAvailability,
  fetchDeliveryTracking,
  fetchGoogleCalendarBusy,
  fetchInventoryItem,
  fetchShopifyOrderStatus,
  fetchWooCommerceOrderStatus,
} from "@/lib/integrations";
import { logWarn } from "@/lib/logger";
import type { IntegrationProvider } from "@/lib/integrations/types";
import type { KnowledgeChunk } from "@/lib/types";

export type DetectedIntegrationIntent = {
  provider: IntegrationProvider;
  reason: string;
  args: Record<string, string>;
};

export type IntegrationToolResult = {
  provider: IntegrationProvider;
  summary: string;
  data: unknown;
  warning: string | null;
};

const ORDER_NAME_REGEX = /#(\d{3,})/;
const TRACKING_REGEX = /\b([A-Z0-9]{8,30})\b/;
const SKU_REGEX = /\b(?:sku|item)[\s:#-]*([A-Z0-9-]{3,30})\b/i;

export function detectIntegrationIntents(message: string): DetectedIntegrationIntent[] {
  const lower = message.toLowerCase();
  const intents: DetectedIntegrationIntent[] = [];

  const orderMatch = ORDER_NAME_REGEX.exec(message);
  if (orderMatch && /\b(order|status|where|tracking|update)\b/.test(lower)) {
    intents.push({
      provider: "shopify",
      reason: `Message mentions order ${orderMatch[0]} — checking commerce status`,
      args: { orderName: orderMatch[0] },
    });
    intents.push({
      provider: "woocommerce",
      reason: `Message mentions order ${orderMatch[0]} — checking WooCommerce status`,
      args: { orderNumber: orderMatch[1] },
    });
  }

  if (/\b(track|tracking|parcel|shipment|delivery|courier)\b/.test(lower)) {
    const tracking = TRACKING_REGEX.exec(message);
    if (tracking) {
      intents.push({
        provider: "delivery_tracking",
        reason: `Message mentions tracking number ${tracking[1]}`,
        args: { trackingNumber: tracking[1] },
      });
    }
  }

  if (/\b(in stock|stock|available|inventory)\b/.test(lower)) {
    const sku = SKU_REGEX.exec(message);
    if (sku) {
      intents.push({
        provider: "custom_inventory",
        reason: `Message mentions SKU ${sku[1]}`,
        args: { sku: sku[1] },
      });
    }
  }

  if (/\b(book|appointment|available time|slot|reschedule)\b/.test(lower)) {
    const start = new Date();
    const end = new Date(start.getTime() + 7 * 86400000);
    intents.push({
      provider: "google_calendar",
      reason: "Message mentions booking or appointment — checking calendar availability",
      args: { windowStart: start.toISOString(), windowEnd: end.toISOString() },
    });
    intents.push({
      provider: "calendly",
      reason: "Message mentions booking or appointment — checking Calendly availability",
      args: { windowStart: start.toISOString(), windowEnd: end.toISOString() },
    });
  }

  return intents;
}

export async function runIntegrationsForMessage(input: {
  clientId: string;
  message: string;
  requestId?: string;
}): Promise<IntegrationToolResult[]> {
  const intents = detectIntegrationIntents(input.message);
  if (!intents.length) return [];

  const results: IntegrationToolResult[] = [];
  for (const intent of intents) {
    // Provider identifiers are not proof that the requester owns an order or parcel.
    // These adapters currently lack a verified customer identity contract.
    if (intent.provider === "shopify" || intent.provider === "woocommerce" ||
        intent.provider === "delivery_tracking") continue;
    const credential = await resolveIntegrationCredential({
      clientId: input.clientId,
      provider: intent.provider,
    });
    if (!credential) continue;

    try {
      const outcome = await callIntegration(input.clientId, intent);
      if (outcome) {
        results.push(outcome);
      }
    } catch (error) {
      logWarn("integration_tool.failed", {
        requestId: input.requestId,
        clientId: input.clientId,
        provider: intent.provider,
        error,
      });
    }
  }
  return results;
}

async function callIntegration(
  clientId: string,
  intent: DetectedIntegrationIntent,
): Promise<IntegrationToolResult | null> {
  if (intent.provider === "shopify" && intent.args.orderName) {
    const res = await fetchShopifyOrderStatus({
      clientId,
      orderName: intent.args.orderName,
    });
    if (!res.data) return null;
    return {
      provider: "shopify",
      summary: `Shopify order ${intent.args.orderName}: financial ${
        res.data.financial_status ?? "unknown"
      }, fulfillment ${res.data.fulfillment_status ?? "unknown"}.`,
      data: res.data,
      warning: res.warning,
    };
  }

  if (intent.provider === "woocommerce" && intent.args.orderNumber) {
    const res = await fetchWooCommerceOrderStatus({
      clientId,
      orderNumber: intent.args.orderNumber,
    });
    if (!res.data) return null;
    return {
      provider: "woocommerce",
      summary: `WooCommerce order ${intent.args.orderNumber}: status ${res.data.status}.`,
      data: res.data,
      warning: res.warning,
    };
  }

  if (intent.provider === "delivery_tracking" && intent.args.trackingNumber) {
    const res = await fetchDeliveryTracking({
      clientId,
      trackingNumber: intent.args.trackingNumber,
    });
    if (!res.data) return null;
    return {
      provider: "delivery_tracking",
      summary: `Delivery tracking ${intent.args.trackingNumber}: ${
        res.data.status ?? "no status"
      }${res.data.last_event_at ? ` (last update ${res.data.last_event_at})` : ""}.`,
      data: res.data,
      warning: res.warning,
    };
  }

  if (intent.provider === "custom_inventory" && intent.args.sku) {
    const res = await fetchInventoryItem({ clientId, sku: intent.args.sku });
    if (!res.data) return null;
    return {
      provider: "custom_inventory",
      summary: `Inventory ${intent.args.sku}: ${
        res.data.in_stock === true
          ? "in stock"
          : res.data.in_stock === false
            ? "out of stock"
            : "stock unknown"
      }${res.data.quantity !== null ? ` (${res.data.quantity} units)` : ""}.`,
      data: res.data,
      warning: res.warning,
    };
  }

  if (intent.provider === "google_calendar") {
    const res = await fetchGoogleCalendarBusy({
      clientId,
      windowStart: new Date(intent.args.windowStart ?? Date.now()),
      windowEnd: new Date(intent.args.windowEnd ?? Date.now() + 7 * 86400000),
    });
    if (!res.data) return null;
    return {
      provider: "google_calendar",
      summary: `Google Calendar busy slots (next 7 days): ${res.data.length} blocks.`,
      data: res.data,
      warning: res.warning,
    };
  }

  if (intent.provider === "calendly") {
    const res = await fetchCalendlyAvailability({
      clientId,
      windowStart: new Date(intent.args.windowStart ?? Date.now()),
      windowEnd: new Date(intent.args.windowEnd ?? Date.now() + 7 * 86400000),
    });
    if (!res.data) return null;
    return {
      provider: "calendly",
      summary: `Calendly open slots (next 7 days): ${res.data.length}.`,
      data: res.data,
      warning: res.warning,
    };
  }

  return null;
}

export function integrationResultsToKnowledgeChunks(
  clientId: string,
  results: IntegrationToolResult[],
): KnowledgeChunk[] {
  return results.map((result, index) => ({
    id: `integration:${result.provider}:${index}`,
    source_id: `integration-source:${result.provider}`,
    client_id: clientId,
    chunk_index: index,
    content: result.summary,
    token_estimate: Math.ceil(result.summary.length / 4),
    score: 0.95,
    metadata: {
      live_source: true,
      provider: result.provider,
      data: result.data,
      warning: result.warning,
    },
  }));
}
