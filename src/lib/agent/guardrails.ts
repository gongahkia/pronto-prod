import { logWarn } from "@/lib/logger";

export type GuardrailResult = {
  shouldEscalate: boolean;
  reasonCode: string;
  reasonDetail: string;
  confidence: number;
};

export type AiDisclosureResult = {
  shouldDisclose: boolean;
  answer: string | null;
};

const refundComplaintPatterns = [
  /\brefund\b/i,
  /\bcomplain/i,
  /\bmissing item\b/i,
  /\blate delivery\b/i,
  /\bwrong order\b/i,
  /\bcompensation\b/i,
];

const transactionalPatterns = [
  /\bpay\b/i,
  /\bpayment\b/i,
  /\bcancel (my )?(booking|reservation|order)\b/i,
  /\bchange (my )?(booking|reservation|order)\b/i,
  /\bmodify (my )?(booking|reservation|order)\b/i,
  /\b(can you|please|help me) (book|reserve) (a )?(table|reservation)\b/i,
  /\b(make|create) (a )?(booking|reservation)\b/i,
];

const humanHandoffPatterns = [
  /\b(hop|jump|get) on (a )?(quick|short )?call\b/i,
  /\b(can|could|may) (i|we) (speak|talk|chat) (to|with) (a )?(human|person|staff|team|manager|owner|representative|agent)\b/i,
  /\b(connect|put|pass|transfer) me (to|with) (a )?(human|person|staff|team|manager|owner|representative|agent)\b/i,
  /\b(call me|phone me|ring me)\b/i,
  /\b(human|person|staff|team|manager|owner|representative) please\b/i,
];

const medicalLegalPatterns = [
  /\bdoctor\b/i,
  /\bmedical\b/i,
  /\blegal\b/i,
  /\bliability\b/i,
  /\bsue\b/i,
  /\bsevere allerg/i,
  /\banaphylaxis\b/i,
];

const sentimentPatterns = [
  /\burgent\b/i,
  /\basap\b/i,
  /\bnow\b/i,
  /\bangry\b/i,
  /\bfrustrated\b/i,
  /\bupset\b/i,
  /\bterrible\b/i,
  /\bawful\b/i,
];

const outOfScopePatterns = [
  /\bwrite my\b/i,
  /\bhomework\b/i,
  /\binvestment advice\b/i,
  /\bweather\b/i,
  /\bnews\b/i,
  /\bcode\b/i,
  /\bkaraoke\b/i,
];

const aiDisclosurePatterns = [
  /\bare you (a )?(bot|robot|ai|artificial intelligence)\b/i,
  /\bam i (talking|speaking) to (a )?(bot|robot|ai|human|person)\b/i,
  /\bis this (a )?(bot|robot|ai|human|person)\b/i,
  /\bhuman or (ai|bot|robot)\b/i,
];

type GuardrailCheck = {
  patterns: RegExp[];
  result: GuardrailResult;
};

const defaultGuardrailChecks: GuardrailCheck[] = [
  {
    patterns: refundComplaintPatterns,
    result: {
      shouldEscalate: true,
      reasonCode: "complaint_or_refund",
      reasonDetail:
        "Refunds, complaints, missing items, and compensation claims require a human owner.",
      confidence: 1,
    },
  },
  {
    patterns: transactionalPatterns,
    result: {
      shouldEscalate: true,
      reasonCode: "transactional_action",
      reasonDetail:
        "The v1 agent may explain process but must not create, cancel, modify, pay, refund, or mutate systems.",
      confidence: 1,
    },
  },
  {
    patterns: humanHandoffPatterns,
    result: {
      shouldEscalate: true,
      reasonCode: "human_handoff_requested",
      reasonDetail:
        "The customer asked for a call, staff member, or human takeover.",
      confidence: 1,
    },
  },
  {
    patterns: medicalLegalPatterns,
    result: {
      shouldEscalate: true,
      reasonCode: "medical_or_legal",
      reasonDetail:
        "Medical, legal, liability, or severe allergy matters always need human review.",
      confidence: 1,
    },
  },
  {
    patterns: sentimentPatterns,
    result: {
      shouldEscalate: true,
      reasonCode: "urgent_or_negative_sentiment",
      reasonDetail:
        "The customer signaled urgency or frustration, so owner attention is safer.",
      confidence: 0.95,
    },
  },
  {
    patterns: outOfScopePatterns,
    result: {
      shouldEscalate: true,
      reasonCode: "out_of_scope",
      reasonDetail:
        "The request is outside the agreed business customer-service scope.",
      confidence: 0.9,
    },
  },
];

const escalationTopicPatterns: Record<string, Pick<GuardrailCheck, "patterns" | "result">> = {
  refund_dispute: {
    patterns: [/\brefund\b/i, /\bchargeback\b/i, /\bcompensation\b/i],
    result: defaultGuardrailChecks[0].result,
  },
  complaint: {
    patterns: [/\bcomplain/i, /\bwrong order\b/i, /\bmissing item\b/i, /\blate delivery\b/i],
    result: defaultGuardrailChecks[0].result,
  },
  booking_mutation: {
    patterns: [
      /\bcancel (my )?(booking|reservation)\b/i,
      /\bchange (my )?(booking|reservation)\b/i,
      /\bmodify (my )?(booking|reservation)\b/i,
    ],
    result: defaultGuardrailChecks[1].result,
  },
  payment: {
    patterns: [/\bpay\b/i, /\bpayment\b/i, /\bcard\b/i],
    result: defaultGuardrailChecks[1].result,
  },
  medical_or_legal: {
    patterns: medicalLegalPatterns,
    result: defaultGuardrailChecks[3].result,
  },
  severe_allergy: {
    patterns: [/\bsevere allerg/i, /\banaphylaxis\b/i, /\ballergic reaction\b/i],
    result: defaultGuardrailChecks[3].result,
  },
  out_of_scope: {
    patterns: outOfScopePatterns,
    result: defaultGuardrailChecks[5].result,
  },
  human_handoff: {
    patterns: humanHandoffPatterns,
    result: defaultGuardrailChecks[2].result,
  },
};

const configurableTermFields: Array<{ field: string; reasonCode: string }> = [
  { field: "complaintOrRefundTerms", reasonCode: "complaint_or_refund" },
  { field: "transactionalActionTerms", reasonCode: "transactional_action" },
  { field: "humanHandoffTerms", reasonCode: "human_handoff_requested" },
  { field: "medicalOrLegalTerms", reasonCode: "medical_or_legal" },
  { field: "sentimentTriggers", reasonCode: "urgent_or_negative_sentiment" },
  { field: "outOfScopeTerms", reasonCode: "out_of_scope" },
];

export function evaluateAiDisclosure(
  customerMessage: string,
  clientName: string,
): AiDisclosureResult {
  if (!aiDisclosurePatterns.some((pattern) => pattern.test(customerMessage))) {
    return { shouldDisclose: false, answer: null };
  }

  return {
    shouldDisclose: true,
    answer: `I am Pronto's AI assistant for ${clientName}. I can help with verified business information, and I will escalate to the team when a human should take over.`,
  };
}

export function evaluatePreGenerationGuardrails(
  customerMessage: string,
  escalationRules?: Record<string, unknown> | null,
): GuardrailResult {
  const checks = buildGuardrailChecks(escalationRules);

  for (const check of checks) {
    if (check.patterns.some((pattern) => pattern.test(customerMessage))) {
      return check.result;
    }
  }

  return {
    shouldEscalate: false,
    reasonCode: "in_scope",
    reasonDetail: "No pre-generation escalation rule matched.",
    confidence: 0,
  };
}

function buildGuardrailChecks(
  escalationRules: Record<string, unknown> | null | undefined,
): GuardrailCheck[] {
  const rules = normalizeRulesObject(escalationRules);
  const disabledReasonCodes = new Set(stringArray(rules.disabledReasonCodes));
  const checks = defaultGuardrailChecks.map((check) => ({
    patterns: [...check.patterns],
    result: check.result,
  }));

  for (const topic of stringArray(rules.alwaysEscalateTopics)) {
    const configured = escalationTopicPatterns[topic];
    if (!configured) {
      logWarn("guardrails.unknown_escalation_topic", { topic });
      continue;
    }
    checks.push({
      patterns: configured.patterns,
      result: configured.result,
    });
  }

  for (const { field, reasonCode } of configurableTermFields) {
    const terms = stringArray(rules[field]);
    if (!terms.length) {
      continue;
    }
    const target = checks.find((check) => check.result.reasonCode === reasonCode);
    if (!target) {
      continue;
    }
    target.patterns.push(...terms.map(literalWordPattern));
  }

  return checks.filter((check) => !disabledReasonCodes.has(check.result.reasonCode));
}

function normalizeRulesObject(
  escalationRules: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  if (!escalationRules) {
    return {};
  }
  if (typeof escalationRules === "object" && !Array.isArray(escalationRules)) {
    return escalationRules;
  }
  logWarn("guardrails.invalid_escalation_rules", {
    rulesType: Array.isArray(escalationRules) ? "array" : typeof escalationRules,
  });
  return {};
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    if (value !== undefined) {
      logWarn("guardrails.invalid_rule_field", { valueType: typeof value });
    }
    return [];
  }
  return value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function literalWordPattern(term: string): RegExp {
  return new RegExp(`\\b${escapeRegExp(term)}\\b`, "i");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function evaluateRetrievalConfidence(
  topScore: number | undefined,
  threshold: number,
): GuardrailResult {
  const score = topScore ?? 0;
  if (score < threshold) {
    return {
      shouldEscalate: true,
      reasonCode: "low_retrieval_confidence",
      reasonDetail: `Top retrieval score ${score.toFixed(3)} is below threshold ${threshold.toFixed(3)}.`,
      confidence: score,
    };
  }

  return {
    shouldEscalate: false,
    reasonCode: "retrieval_confident",
    reasonDetail: "Retrieved source material met the configured threshold.",
    confidence: score,
  };
}
