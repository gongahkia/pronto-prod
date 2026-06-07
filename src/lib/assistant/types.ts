import { z } from "zod";
import type { SessionUser } from "@/lib/auth";

export const assistantActionTypes = [
  "escalation_claim",
  "escalation_resolve",
  "escalation_retry_outbound",
  "knowledge_create",
  "knowledge_update",
  "knowledge_delete",
  "knowledge_refresh_create",
  "knowledge_refresh_resolve",
  "assistant_request_create",
  "review_create",
  "channel_health_check",
  "channel_update",
  "client_create",
  "commercial_update",
  "agent_config_update",
  "brand_voice_update_document",
  "brand_voice_add_example",
  "brand_voice_toggle_example",
  "brand_voice_delete_example",
  "offboarding_export",
  "offboarding_delete",
] as const;

export type AssistantActionType = (typeof assistantActionTypes)[number];

export type AssistantCitation = {
  type: string;
  id: string;
  label: string;
  href?: string;
};

export type AssistantActionDraft = {
  actionType: AssistantActionType;
  title: string;
  description: string;
  payload: Record<string, unknown>;
};

export type AssistantIntent =
  | "attention"
  | "causal_debug"
  | "knowledge_update"
  | "client_health"
  | "conversation_detail"
  | "action_request"
  | "general";

export type AssistantRoleMode = "client_owner" | "operator";

export type AssistantNextAction = {
  label: string;
  href?: string;
  prompt?: string;
  proposal?: AssistantActionDraft;
};

export type AssistantActionResult = {
  message: string;
  href?: string;
  data?: Record<string, unknown>;
  nextActions?: AssistantNextAction[];
};

export type AssistantGeneratedTurn = {
  answer: string;
  citedRecords: AssistantCitation[];
  followUpQuestions: string[];
  actionProposals: AssistantActionDraft[];
};

export type AssistantContextRecord = {
  type: string;
  id: string;
  label: string;
  href?: string;
  data: Record<string, unknown>;
};

export type AssistantContext = {
  user: Pick<SessionUser, "userId" | "email" | "name" | "role" | "clientId">;
  pagePath: string | null;
  focusedClientId: string | null;
  focusedClientName: string | null;
  focusedConversationId: string | null;
  intent: AssistantIntent;
  roleMode: AssistantRoleMode;
  summary: string[];
  focusedRecords: AssistantContextRecord[];
  records: AssistantContextRecord[];
};

export type AssistantThreadSummary = {
  id: string;
  title: string;
  role: SessionUser["role"];
  client_id: string | null;
  page_path: string | null;
  created_at: Date;
  updated_at: Date;
};

export type AssistantMessageRecord = {
  id: string;
  thread_id: string;
  user_id: string | null;
  role: "user" | "assistant" | "system";
  body: string;
  metadata: Record<string, unknown>;
  created_at: Date;
};

export type AssistantActionProposalRecord = {
  id: string;
  thread_id: string;
  message_id: string | null;
  user_id: string | null;
  client_id: string | null;
  action_type: AssistantActionType;
  title: string;
  description: string;
  payload: Record<string, unknown>;
  status: "pending" | "confirmed" | "executed" | "failed" | "cancelled";
  requires_typed_confirmation: string | null;
  result: Record<string, unknown> | null;
  error: string | null;
  confirmed_at: Date | null;
  executed_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

export const assistantCitationSchema = z.object({
  type: z.string().min(1).max(80),
  id: z.string().min(1).max(160),
  label: z.string().min(1).max(200),
  href: z.preprocess(
    (value) => (value === null ? undefined : value),
    z.string().max(300).optional(),
  ),
});

export const assistantActionDraftSchema = z.object({
  actionType: z.enum(assistantActionTypes),
  title: z.string().min(1).max(140),
  description: z.string().min(1).max(500),
  payload: z.record(z.string(), z.unknown()),
});

export const assistantGeneratedTurnSchema = z.object({
  answer: z.string().min(1).max(5000),
  citedRecords: z.array(assistantCitationSchema).max(12).default([]),
  followUpQuestions: z.array(z.string().min(1).max(180)).max(4).default([]),
  actionProposals: z.array(assistantActionDraftSchema).max(5).default([]),
});
