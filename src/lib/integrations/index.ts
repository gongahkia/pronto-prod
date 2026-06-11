import { googleCalendarDefinition } from "@/lib/integrations/google-calendar";
import { calendlyDefinition } from "@/lib/integrations/calendly";
import { shopifyDefinition } from "@/lib/integrations/shopify";
import { wooCommerceDefinition } from "@/lib/integrations/woocommerce";
import { deliveryTrackingDefinition } from "@/lib/integrations/delivery";
import { customInventoryDefinition } from "@/lib/integrations/inventory";
import type { IntegrationDefinition, IntegrationProvider } from "@/lib/integrations/types";

export const integrationLibrary: Record<IntegrationProvider, IntegrationDefinition> = {
  google_calendar: googleCalendarDefinition,
  calendly: calendlyDefinition,
  shopify: shopifyDefinition,
  woocommerce: wooCommerceDefinition,
  delivery_tracking: deliveryTrackingDefinition,
  custom_inventory: customInventoryDefinition,
};

export function listIntegrationDefinitions(): IntegrationDefinition[] {
  return Object.values(integrationLibrary);
}

export function getIntegrationDefinition(
  provider: IntegrationProvider,
): IntegrationDefinition {
  return integrationLibrary[provider];
}

export * from "@/lib/integrations/types";
export * from "@/lib/integrations/credentials";
export { fetchGoogleCalendarBusy } from "@/lib/integrations/google-calendar";
export { fetchCalendlyAvailability } from "@/lib/integrations/calendly";
export {
  searchShopifyProducts,
  fetchShopifyOrderStatus,
} from "@/lib/integrations/shopify";
export {
  searchWooCommerceProducts,
  fetchWooCommerceOrderStatus,
} from "@/lib/integrations/woocommerce";
export { fetchDeliveryTracking } from "@/lib/integrations/delivery";
export { fetchInventoryItem } from "@/lib/integrations/inventory";
