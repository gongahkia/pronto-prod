export type TriageFlowNodeKind = "channel" | "decision" | "outcome";

export type TriageDecisionKey =
  | "complaint_or_refund"
  | "transactional_action"
  | "human_handoff_requested"
  | "medical_or_legal"
  | "urgent_or_negative_sentiment"
  | "out_of_scope";

export type TriageFlowNodeData = {
  kind: TriageFlowNodeKind;
  label: string;
  description: string;
  badge?: string;
  decisionKey?: TriageDecisionKey;
  reasonCode?: string;
  enabled?: boolean;
  triggerTerms?: string[];
};

export type TriageFlowNode = {
  id: string;
  type: "triage";
  position: { x: number; y: number };
  data: TriageFlowNodeData;
};

export type TriageFlowEdge = {
  id: string;
  source: string;
  target: string;
  type?: "smoothstep";
  label?: string;
  animated?: boolean;
};

export type TriageFlowDraft = {
  nodes: TriageFlowNode[];
  edges: TriageFlowEdge[];
};

type DecisionDefinition = {
  nodeId: string;
  decisionKey: TriageDecisionKey;
  reasonCode: string;
  ruleField: string;
  topics: string[];
  label: string;
  description: string;
  triggerTerms: string[];
};

export class TriageFlowValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TriageFlowValidationError";
  }
}

const MAX_LABEL_LENGTH = 80;
const MAX_DESCRIPTION_LENGTH = 240;
const MAX_TERM_LENGTH = 48;
const MAX_TERMS_PER_DECISION = 20;

export const TRIAGE_DECISIONS: DecisionDefinition[] = [
  {
    nodeId: "decision-complaint-refund",
    decisionKey: "complaint_or_refund",
    reasonCode: "complaint_or_refund",
    ruleField: "complaintOrRefundTerms",
    topics: ["refund_dispute", "complaint"],
    label: "Refunds and complaints",
    description: "Claims, refunds, missing items, late orders, or compensation requests.",
    triggerTerms: ["refund", "wrong order", "missing item", "late delivery", "compensation"],
  },
  {
    nodeId: "decision-booking-payment",
    decisionKey: "transactional_action",
    reasonCode: "transactional_action",
    ruleField: "transactionalActionTerms",
    topics: ["booking_mutation", "payment"],
    label: "Bookings, orders, and payments",
    description: "Requests to create, cancel, modify, pay, refund, or mutate systems.",
    triggerTerms: ["cancel booking", "change booking", "modify order", "payment", "pay"],
  },
  {
    nodeId: "decision-human-handoff",
    decisionKey: "human_handoff_requested",
    reasonCode: "human_handoff_requested",
    ruleField: "humanHandoffTerms",
    topics: ["human_handoff"],
    label: "Human handoff",
    description: "Requests for staff, a manager, a phone call, or a human takeover.",
    triggerTerms: ["speak to human", "manager", "call me", "talk to staff"],
  },
  {
    nodeId: "decision-medical-legal",
    decisionKey: "medical_or_legal",
    reasonCode: "medical_or_legal",
    ruleField: "medicalOrLegalTerms",
    topics: ["medical_or_legal", "severe_allergy"],
    label: "Safety, allergy, legal",
    description: "Severe allergies, medical questions, liability, legal threats, or safety issues.",
    triggerTerms: ["severe allergy", "anaphylaxis", "legal", "liability", "doctor"],
  },
  {
    nodeId: "decision-urgent-sentiment",
    decisionKey: "urgent_or_negative_sentiment",
    reasonCode: "urgent_or_negative_sentiment",
    ruleField: "sentimentTriggers",
    topics: [],
    label: "Urgent or negative sentiment",
    description: "Customers who sound angry, frustrated, upset, or time-sensitive.",
    triggerTerms: ["urgent", "angry", "frustrated", "upset", "terrible"],
  },
  {
    nodeId: "decision-out-of-scope",
    decisionKey: "out_of_scope",
    reasonCode: "out_of_scope",
    ruleField: "outOfScopeTerms",
    topics: ["out_of_scope"],
    label: "Outside service scope",
    description: "Requests unrelated to the agreed business customer-service scope.",
    triggerTerms: ["karaoke", "homework", "investment advice", "weather", "news"],
  },
];

const decisionByNodeId = new Map(TRIAGE_DECISIONS.map((decision) => [decision.nodeId, decision]));
const decisionByKey = new Map(TRIAGE_DECISIONS.map((decision) => [decision.decisionKey, decision]));

const defaultNodes: TriageFlowNode[] = [
  {
    id: "channel-whatsapp",
    type: "triage",
    position: { x: -620, y: -190 },
    data: {
      kind: "channel",
      label: "WhatsApp",
      description: "Customer messages from WhatsApp Cloud API.",
      badge: "channel",
    },
  },
  {
    id: "channel-telegram",
    type: "triage",
    position: { x: -620, y: 0 },
    data: {
      kind: "channel",
      label: "Telegram",
      description: "Customer messages from Telegram bot.",
      badge: "channel",
    },
  },
  {
    id: "channel-console",
    type: "triage",
    position: { x: -620, y: 190 },
    data: {
      kind: "channel",
      label: "Pilot console",
      description: "Local QA messages before live channel traffic.",
      badge: "channel",
    },
  },
  ...TRIAGE_DECISIONS.map<TriageFlowNode>((decision, index) => ({
    id: decision.nodeId,
    type: "triage",
    position: {
      x: index < 3 ? -110 : 270,
      y: index < 3 ? -260 + index * 190 : -260 + (index - 3) * 190,
    },
    data: {
      kind: "decision",
      label: decision.label,
      description: decision.description,
      badge: "decision",
      decisionKey: decision.decisionKey,
      reasonCode: decision.reasonCode,
      enabled: true,
      triggerTerms: [...decision.triggerTerms],
    },
  })),
  {
    id: "outcome-answer",
    type: "triage",
    position: { x: 760, y: -210 },
    data: {
      kind: "outcome",
      label: "Answer from knowledge",
      description: "Pronto answers only when verified knowledge and guardrails allow it.",
      badge: "answer",
    },
  },
  {
    id: "outcome-owner-triage",
    type: "triage",
    position: { x: 760, y: 20 },
    data: {
      kind: "outcome",
      label: "Owner triage",
      description: "Pronto silently hands off and alerts the owner before replying.",
      badge: "triage",
    },
  },
  {
    id: "outcome-human-reply",
    type: "triage",
    position: { x: 760, y: 250 },
    data: {
      kind: "outcome",
      label: "Human reply required",
      description: "A client owner or Pronto operator writes the final customer reply.",
      badge: "handoff",
    },
  },
];

const defaultEdges: TriageFlowEdge[] = [
  { id: "edge-whatsapp-complaint", source: "channel-whatsapp", target: "decision-complaint-refund", type: "smoothstep" },
  { id: "edge-telegram-complaint", source: "channel-telegram", target: "decision-complaint-refund", type: "smoothstep" },
  { id: "edge-console-complaint", source: "channel-console", target: "decision-complaint-refund", type: "smoothstep" },
  { id: "edge-complaint-booking", source: "decision-complaint-refund", target: "decision-booking-payment", type: "smoothstep", label: "else" },
  { id: "edge-booking-human", source: "decision-booking-payment", target: "decision-human-handoff", type: "smoothstep", label: "else" },
  { id: "edge-human-medical", source: "decision-human-handoff", target: "decision-medical-legal", type: "smoothstep", label: "else" },
  { id: "edge-medical-sentiment", source: "decision-medical-legal", target: "decision-urgent-sentiment", type: "smoothstep", label: "else" },
  { id: "edge-sentiment-scope", source: "decision-urgent-sentiment", target: "decision-out-of-scope", type: "smoothstep", label: "else" },
  { id: "edge-scope-answer", source: "decision-out-of-scope", target: "outcome-answer", type: "smoothstep", label: "in scope" },
  { id: "edge-complaint-triage", source: "decision-complaint-refund", target: "outcome-owner-triage", type: "smoothstep", label: "match", animated: true },
  { id: "edge-booking-triage", source: "decision-booking-payment", target: "outcome-owner-triage", type: "smoothstep", label: "match", animated: true },
  { id: "edge-human-reply", source: "decision-human-handoff", target: "outcome-human-reply", type: "smoothstep", label: "match", animated: true },
  { id: "edge-medical-reply", source: "decision-medical-legal", target: "outcome-human-reply", type: "smoothstep", label: "match", animated: true },
  { id: "edge-sentiment-triage", source: "decision-urgent-sentiment", target: "outcome-owner-triage", type: "smoothstep", label: "match", animated: true },
  { id: "edge-scope-triage", source: "decision-out-of-scope", target: "outcome-owner-triage", type: "smoothstep", label: "match", animated: true },
];

const defaultNodeIds = new Set(defaultNodes.map((node) => node.id));
const defaultEdgeById = new Map(defaultEdges.map((edge) => [edge.id, edge]));

export function buildDefaultTriageFlow(): TriageFlowDraft {
  return {
    nodes: defaultNodes.map((node) => ({
      ...node,
      position: { ...node.position },
      data: {
        ...node.data,
        triggerTerms: node.data.triggerTerms ? [...node.data.triggerTerms] : undefined,
      },
    })),
    edges: defaultEdges.map((edge) => ({ ...edge })),
  };
}

export function validateAndNormalizeTriageFlow(input: unknown): TriageFlowDraft {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new TriageFlowValidationError("Flow payload must be an object.");
  }

  const draft = input as Partial<TriageFlowDraft>;
  if (!Array.isArray(draft.nodes) || !Array.isArray(draft.edges)) {
    throw new TriageFlowValidationError("Flow payload must include nodes and edges.");
  }

  const nodes = normalizeNodes(draft.nodes);
  const edges = normalizeEdges(draft.edges);
  ensureRequiredGraph(nodes, edges);

  return { nodes, edges };
}

export function compileTriageFlowToEscalationRules(
  nodes: TriageFlowNode[],
): Record<string, unknown> {
  const normalizedNodes = normalizeNodes(nodes);
  const alwaysEscalateTopics = new Set<string>();
  const disabledReasonCodes: string[] = [];
  const rules: Record<string, unknown> = {
    source: "triage_flow",
    version: 1,
  };

  for (const decision of TRIAGE_DECISIONS) {
    const node = normalizedNodes.find((candidate) => candidate.id === decision.nodeId);
    if (!node || node.data.kind !== "decision") {
      throw new TriageFlowValidationError(`Missing decision node ${decision.nodeId}.`);
    }

    if (node.data.enabled === false) {
      disabledReasonCodes.push(decision.reasonCode);
      continue;
    }

    for (const topic of decision.topics) {
      alwaysEscalateTopics.add(topic);
    }

    const terms = sanitizeTerms(node.data.triggerTerms ?? []);
    if (terms.length) {
      rules[decision.ruleField] = terms;
    }
  }

  rules.alwaysEscalateTopics = [...alwaysEscalateTopics];
  if (disabledReasonCodes.length) {
    rules.disabledReasonCodes = disabledReasonCodes;
  }

  return rules;
}

function normalizeNodes(nodes: unknown[]): TriageFlowNode[] {
  const seen = new Set<string>();
  return nodes.map((node) => {
    if (!node || typeof node !== "object" || Array.isArray(node)) {
      throw new TriageFlowValidationError("Each flow node must be an object.");
    }

    const candidate = node as Partial<TriageFlowNode>;
    if (!candidate.id || !defaultNodeIds.has(candidate.id)) {
      throw new TriageFlowValidationError("Flow contains an unknown node.");
    }
    if (seen.has(candidate.id)) {
      throw new TriageFlowValidationError(`Flow contains duplicate node ${candidate.id}.`);
    }
    seen.add(candidate.id);

    const template = defaultNodes.find((defaultNode) => defaultNode.id === candidate.id);
    if (!template) {
      throw new TriageFlowValidationError("Flow contains an unsupported node.");
    }

    const position = normalizePosition(candidate.position);
    const inputData = normalizeDataObject(candidate.data);
    const templateData = template.data;
    const label = sanitizeText(inputData.label, templateData.label, MAX_LABEL_LENGTH);
    const description = sanitizeText(
      inputData.description,
      templateData.description,
      MAX_DESCRIPTION_LENGTH,
    );

    if (templateData.kind === "decision") {
      const definition = decisionByNodeId.get(candidate.id);
      if (
        !definition ||
        inputData.decisionKey !== definition.decisionKey ||
        (inputData.reasonCode !== undefined && inputData.reasonCode !== definition.reasonCode)
      ) {
        throw new TriageFlowValidationError("Flow contains an invalid decision node.");
      }

      return {
        id: template.id,
        type: "triage",
        position,
        data: {
          kind: "decision",
          label,
          description,
          badge: templateData.badge,
          decisionKey: definition.decisionKey,
          reasonCode: definition.reasonCode,
          enabled: inputData.enabled !== false,
          triggerTerms: sanitizeTerms(
            Array.isArray(inputData.triggerTerms)
              ? inputData.triggerTerms
              : definition.triggerTerms,
          ),
        },
      };
    }

    if (inputData.kind !== templateData.kind) {
      throw new TriageFlowValidationError("Flow contains an invalid node type.");
    }

    return {
      id: template.id,
      type: "triage",
      position,
      data: {
        kind: templateData.kind,
        label,
        description,
        badge: templateData.badge,
      },
    };
  });
}

function normalizeEdges(edges: unknown[]): TriageFlowEdge[] {
  const seen = new Set<string>();
  return edges.map((edge) => {
    if (!edge || typeof edge !== "object" || Array.isArray(edge)) {
      throw new TriageFlowValidationError("Each flow edge must be an object.");
    }
    const candidate = edge as Partial<TriageFlowEdge>;
    const template = candidate.id ? defaultEdgeById.get(candidate.id) : undefined;
    if (!template) {
      throw new TriageFlowValidationError("Flow contains an unknown edge.");
    }
    if (seen.has(template.id)) {
      throw new TriageFlowValidationError(`Flow contains duplicate edge ${template.id}.`);
    }
    seen.add(template.id);
    if (candidate.source !== template.source || candidate.target !== template.target) {
      throw new TriageFlowValidationError("Flow contains a disconnected edge.");
    }
    return { ...template };
  });
}

function ensureRequiredGraph(nodes: TriageFlowNode[], edges: TriageFlowEdge[]): void {
  if (nodes.length !== defaultNodes.length) {
    throw new TriageFlowValidationError("Flow must include every starter triage node.");
  }
  if (edges.length !== defaultEdges.length) {
    throw new TriageFlowValidationError("Flow must include every starter triage connection.");
  }

  for (const node of defaultNodes) {
    if (!nodes.some((candidate) => candidate.id === node.id)) {
      throw new TriageFlowValidationError(`Flow is missing node ${node.id}.`);
    }
  }
  for (const edge of defaultEdges) {
    if (!edges.some((candidate) => candidate.id === edge.id)) {
      throw new TriageFlowValidationError(`Flow is missing edge ${edge.id}.`);
    }
  }
  for (const decision of TRIAGE_DECISIONS) {
    const node = nodes.find((candidate) => candidate.data.decisionKey === decision.decisionKey);
    if (!node || node.data.reasonCode !== decision.reasonCode) {
      throw new TriageFlowValidationError(`Flow is missing ${decision.label}.`);
    }
  }
}

function normalizePosition(position: unknown): { x: number; y: number } {
  if (!position || typeof position !== "object" || Array.isArray(position)) {
    throw new TriageFlowValidationError("Each flow node must include a position.");
  }
  const candidate = position as { x?: unknown; y?: unknown };
  if (typeof candidate.x !== "number" || typeof candidate.y !== "number") {
    throw new TriageFlowValidationError("Flow node positions must be numeric.");
  }
  if (!Number.isFinite(candidate.x) || !Number.isFinite(candidate.y)) {
    throw new TriageFlowValidationError("Flow node positions must be finite.");
  }
  return {
    x: clamp(candidate.x, -2400, 2400),
    y: clamp(candidate.y, -1800, 1800),
  };
}

function normalizeDataObject(data: unknown): Record<string, unknown> {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new TriageFlowValidationError("Each flow node must include data.");
  }
  return data as Record<string, unknown>;
}

function sanitizeText(value: unknown, fallback: string, maxLength: number): string {
  if (typeof value !== "string") {
    return fallback;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return fallback;
  }
  return trimmed.slice(0, maxLength);
}

function sanitizeTerms(value: unknown[]): string[] {
  const terms: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string") {
      continue;
    }
    const term = entry.trim().replace(/\s+/g, " ");
    if (!term) {
      continue;
    }
    if (term.length > MAX_TERM_LENGTH) {
      throw new TriageFlowValidationError(
        `Trigger term "${term.slice(0, 24)}..." is too long.`,
      );
    }
    if (!terms.some((existing) => existing.toLowerCase() === term.toLowerCase())) {
      terms.push(term);
    }
    if (terms.length > MAX_TERMS_PER_DECISION) {
      throw new TriageFlowValidationError(
        `Each decision can have at most ${MAX_TERMS_PER_DECISION} trigger terms.`,
      );
    }
  }
  return terms;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function decisionDefinitionForKey(
  key: TriageDecisionKey,
): DecisionDefinition | undefined {
  return decisionByKey.get(key);
}
