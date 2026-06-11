import { assertSameOrigin } from "@/lib/http/csrf";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import {
  fetchCalendlyAvailability,
  fetchDeliveryTracking,
  fetchGoogleCalendarBusy,
  fetchInventoryItem,
  fetchShopifyOrderStatus,
  fetchWooCommerceOrderStatus,
  searchShopifyProducts,
  searchWooCommerceProducts,
} from "@/lib/integrations";
import type { IntegrationProvider } from "@/lib/integrations/types";
import {
  logWarn,
  redactErrorMessage,
  requestIdFromRequest,
  requestIdHeaders,
} from "@/lib/logger";
import { canAccessClient } from "@/lib/rbac";

export async function POST(request: Request) {
  const csrf = assertSameOrigin(request);
  if (csrf) return csrf;

  const requestId = requestIdFromRequest(request);
  const user = await requireUser("operator");

  const payload = (await request.json()) as {
    clientId?: string;
    provider?: string;
    args?: Record<string, unknown>;
  };
  const clientId = String(payload.clientId ?? "").trim();
  const provider = String(payload.provider ?? "").trim() as IntegrationProvider;
  const args = payload.args ?? {};

  if (!clientId) {
    return NextResponse.json(
      { error: "clientId is required." },
      { status: 400, headers: requestIdHeaders(requestId) },
    );
  }
  if (!canAccessClient(user, clientId)) {
    return NextResponse.json(
      { error: "Forbidden." },
      { status: 403, headers: requestIdHeaders(requestId) },
    );
  }

  try {
    const result = await runIntegrationTest({ clientId, provider, args });
    return NextResponse.json(
      { ok: true, provider, ...result },
      { headers: requestIdHeaders(requestId) },
    );
  } catch (error) {
    logWarn("integration.test_failed", {
      requestId,
      provider,
      clientId,
      error: redactErrorMessage(error),
    });
    return NextResponse.json(
      {
        ok: false,
        provider,
        error: redactErrorMessage(error),
      },
      { status: 502, headers: requestIdHeaders(requestId) },
    );
  }
}

async function runIntegrationTest(input: {
  clientId: string;
  provider: IntegrationProvider;
  args: Record<string, unknown>;
}): Promise<{ data: unknown; warning: string | null }> {
  const { clientId, provider, args } = input;
  if (provider === "google_calendar") {
    const start = parseDate(args.windowStart) ?? new Date();
    const end = parseDate(args.windowEnd) ?? new Date(start.getTime() + 7 * 86400000);
    return fetchGoogleCalendarBusy({ clientId, windowStart: start, windowEnd: end });
  }
  if (provider === "calendly") {
    const start = parseDate(args.windowStart) ?? new Date();
    const end = parseDate(args.windowEnd) ?? new Date(start.getTime() + 7 * 86400000);
    return fetchCalendlyAvailability({ clientId, windowStart: start, windowEnd: end });
  }
  if (provider === "shopify") {
    if (typeof args.orderName === "string" && args.orderName.trim()) {
      return fetchShopifyOrderStatus({ clientId, orderName: args.orderName.trim() });
    }
    const search = typeof args.query === "string" ? args.query : "";
    return searchShopifyProducts({ clientId, query: search });
  }
  if (provider === "woocommerce") {
    if (typeof args.orderNumber === "string" && args.orderNumber.trim()) {
      return fetchWooCommerceOrderStatus({
        clientId,
        orderNumber: args.orderNumber.trim(),
      });
    }
    const search = typeof args.query === "string" ? args.query : "";
    return searchWooCommerceProducts({ clientId, query: search });
  }
  if (provider === "delivery_tracking") {
    const trackingNumber =
      typeof args.trackingNumber === "string" ? args.trackingNumber : "";
    if (!trackingNumber.trim()) {
      throw new Error("trackingNumber is required.");
    }
    return fetchDeliveryTracking({ clientId, trackingNumber });
  }
  if (provider === "custom_inventory") {
    const sku = typeof args.sku === "string" ? args.sku : "";
    if (!sku.trim()) {
      throw new Error("sku is required.");
    }
    return fetchInventoryItem({ clientId, sku });
  }
  throw new Error(`Unsupported integration provider: ${provider}`);
}

function parseDate(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
