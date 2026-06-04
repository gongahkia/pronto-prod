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
): GuardrailResult {
  const checks: Array<[RegExp[], GuardrailResult]> = [
    [
      refundComplaintPatterns,
      {
        shouldEscalate: true,
        reasonCode: "complaint_or_refund",
        reasonDetail:
          "Refunds, complaints, missing items, and compensation claims require a human owner.",
        confidence: 1,
      },
    ],
    [
      transactionalPatterns,
      {
        shouldEscalate: true,
        reasonCode: "transactional_action",
        reasonDetail:
          "The v1 agent may explain process but must not create, cancel, modify, pay, refund, or mutate systems.",
        confidence: 1,
      },
    ],
    [
      humanHandoffPatterns,
      {
        shouldEscalate: true,
        reasonCode: "human_handoff_requested",
        reasonDetail:
          "The customer asked for a call, staff member, or human takeover.",
        confidence: 1,
      },
    ],
    [
      medicalLegalPatterns,
      {
        shouldEscalate: true,
        reasonCode: "medical_or_legal",
        reasonDetail:
          "Medical, legal, liability, or severe allergy matters always need human review.",
        confidence: 1,
      },
    ],
    [
      sentimentPatterns,
      {
        shouldEscalate: true,
        reasonCode: "urgent_or_negative_sentiment",
        reasonDetail:
          "The customer signaled urgency or frustration, so owner attention is safer.",
        confidence: 0.95,
      },
    ],
    [
      outOfScopePatterns,
      {
        shouldEscalate: true,
        reasonCode: "out_of_scope",
        reasonDetail:
          "The request is outside the agreed business customer-service scope.",
        confidence: 0.9,
      },
    ],
  ];

  for (const [patterns, result] of checks) {
    if (patterns.some((pattern) => pattern.test(customerMessage))) {
      return result;
    }
  }

  return {
    shouldEscalate: false,
    reasonCode: "in_scope",
    reasonDetail: "No pre-generation escalation rule matched.",
    confidence: 0,
  };
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
