export type UserRole = "operator" | "client";
export type ChannelKind = "whatsapp" | "telegram" | "console";
export type ChannelStatus = "draft" | "active" | "disabled";
export type ConversationStatus = "active" | "escalated" | "closed";
export type SenderRole = "customer" | "agent" | "operator" | "system";
export type EscalationStatus = "open" | "claimed" | "resolved";

export type Client = {
  id: string;
  name: string;
  slug: string;
  vertical: string;
  plan_tier: string;
  status: string;
  business_profile: Record<string, unknown>;
  brand_voice: string;
  created_at: Date;
  updated_at: Date;
};

export type User = {
  id: string;
  client_id: string | null;
  email: string;
  name: string;
  role: UserRole;
  password_hash: string;
  created_at: Date;
};

export type Channel = {
  id: string;
  client_id: string;
  kind: ChannelKind;
  name: string;
  status: ChannelStatus;
  external_id: string | null;
  credentials: Record<string, unknown>;
  settings: Record<string, unknown>;
  last_health_check_at: Date | null;
  last_health_status: string | null;
  last_health_error: string | null;
  last_outbound_at: Date | null;
  last_outbound_error: string | null;
};

export type AgentConfig = {
  id: string;
  client_id: string;
  response_provider: string;
  response_model: string;
  embedding_provider: string;
  embedding_model: string;
  retrieval_threshold: string;
  prompt_preamble: string;
  escalation_rules: Record<string, unknown>;
};

export type Conversation = {
  id: string;
  client_id: string;
  channel_id: string;
  external_thread_id: string;
  customer_name: string | null;
  customer_handle: string | null;
  status: ConversationStatus;
  last_message_at: Date;
  created_at: Date;
};

export type Message = {
  id: string;
  conversation_id: string;
  client_id: string;
  channel_id: string;
  external_message_id: string;
  sender_role: SenderRole;
  body: string;
  metadata: Record<string, unknown>;
  created_at: Date;
};

export type KnowledgeChunk = {
  id: string;
  source_id: string;
  client_id: string;
  chunk_index: number;
  content: string;
  token_estimate: number;
  score?: number;
  metadata: Record<string, unknown>;
};

export type Escalation = {
  id: string;
  client_id: string;
  conversation_id: string;
  message_id: string;
  status: EscalationStatus;
  reason_code: string;
  reason_detail: string;
  confidence: string | null;
  owner_notified_at: Date | null;
  created_at: Date;
  resolved_at: Date | null;
};
