export type IntegrationProvider =
  | "google_calendar"
  | "calendly"
  | "shopify"
  | "woocommerce"
  | "delivery_tracking"
  | "custom_inventory";

export type IntegrationKind = "calendar" | "commerce" | "delivery" | "inventory";

export type IntegrationAccessMode = "read_only" | "read_write";

export type IntegrationDefinition = {
  provider: IntegrationProvider;
  kind: IntegrationKind;
  label: string;
  description: string;
  accessMode: IntegrationAccessMode;
  credentialFields: IntegrationCredentialField[];
  escalateOn: string[];
};

export type IntegrationCredentialField = {
  name: string;
  label: string;
  secret: boolean;
  required: boolean;
};

export type IntegrationCallResult<T> = {
  data: T | null;
  warning: string | null;
};

export type IntegrationCredentialRecord = {
  id: string;
  client_id: string;
  provider: string;
  label: string | null;
  metadata: Record<string, unknown>;
  rotation_due_at: Date | null;
  last_rotated_at: Date | null;
  created_at: Date;
  updated_at: Date;
};
