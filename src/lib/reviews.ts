export const answerLabels = [
  "answered_correctly",
  "should_have_escalated",
  "over_escalated",
  "hallucinated",
  "needs_knowledge_update",
] as const;

export const failureSeverities = ["p0", "p1", "p2", "p3"] as const;

export const rootCauses = [
  "missing_source",
  "bad_retrieval",
  "guardrail_gap",
  "prompt_gap",
  "integration_gap",
  "channel_issue",
  "human_process",
] as const;

export const fixOwners = ["gabriel", "keith", "astin", "client"] as const;

export type AnswerLabel = (typeof answerLabels)[number];
export type FailureSeverity = (typeof failureSeverities)[number];
export type RootCause = (typeof rootCauses)[number];
export type FixOwner = (typeof fixOwners)[number];

export function optionalEnumValue<T extends readonly string[]>(
  value: FormDataEntryValue | null,
  allowed: T,
): T[number] | null {
  const text = String(value ?? "");
  return allowed.includes(text) ? text : null;
}
