export type AnalyticsWindow = 7 | 30 | 90;
export type Sentiment = 'positive' | 'neutral' | 'negative' | 'mixed' | 'unclear';
export type AnalyticsConversation = {
  id: string; customer: string; channel: string; status: string; needsTeam: boolean; assistantCompleted: boolean;
  updatedAt: string; messages: { id: string; role: string; body: string }[];
};
export type Synthesis = {
  summary: string;
  topics: { id: string; name: string; description: string; conversationIds: string[] }[];
  conversations: { id: string; topicId: string; sentiment: Sentiment; summary: string; evidenceMessageIds: string[] }[];
  recommendations: { title: string; detail: string; priority: 'high' | 'medium' | 'low'; conversationIds: string[] }[];
  knowledgeGaps: { question: string; conversationIds: string[] }[];
};
export type InsightSnapshot = { id: string; status: 'generating' | 'ready' | 'failed'; fingerprint: string;
  provider: string; model: string; sample_count: number; payload: Synthesis | null; created_at: string; error_message: string | null };
export type AnalyticsData = {
  days: AnalyticsWindow; from: string; until: string; fingerprint: string;
  totals: { conversations: number; needsTeam: number; assistantCompleted: number; customerMessages: number;
    deliveredReplies: number; firstReplySeconds: number | null; csatAverage: number | null; csatResponses: number };
  daily: { date: string; customers: number; replies: number }[];
  channels: { kind: string; conversations: number; needsTeam: number }[];
  handoffs: { reason: string; count: number }[];
  sample: AnalyticsConversation[]; snapshot: InsightSnapshot | null;
};
export type UsageSummary = {
  month: string; from: string; until: string;
  deliveredReplies: number; generationCalls: number; internalCalls: number; embeddingCalls: number;
  providerInputTokens: number; providerOutputTokens: number; estimatedInputTokens: number; estimatedOutputTokens: number;
  reasoningTokens: number; reasoningReportedCalls: number; providerReportedCalls: number; estimatedCalls: number;
  breakdown: { purpose: string; calls: number; inputTokens: number; outputTokens: number; estimatedCalls: number }[];
  models: { provider: string; model: string; calls: number }[];
};
