import type { ChannelKind } from "@/lib/types";

export type TriageFlowNodeKind = "channel" | "decision" | "outcome" | "note";

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
  channelKind?: ChannelKind;
  decisionKey?: TriageDecisionKey;
  reasonCode?: string;
  enabled?: boolean;
  triggerTerms?: string[];
  channelOverrides?: Partial<Record<ChannelKind, TriageChannelOverride>>;
};

export type TriageChannelOverride = {
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
const MAX_EDGE_LABEL_LENGTH = 32;
const MAX_TERM_LENGTH = 48;
const MAX_TERMS_PER_DECISION = 20;
const MAX_FLOW_NODES = 48;
const MAX_FLOW_EDGES = 96;
const FLOW_ID_PATTERN = /^[a-zA-Z0-9:_-]{3,96}$/;
const TRIAGE_CHANNELS: ChannelKind[] = [
  "whatsapp",
  "telegram",
  "instagram",
  "messenger",
  "email",
];

export const TRIAGE_CHANNEL_COPY: Record<ChannelKind, { label: string; description: string }> = {
  console: { label: "Simulated DM", description: "Authenticated local customer simulation; no provider account." },
  whatsapp: {
    label: "Receive WhatsApp message",
    description: "Inbound WhatsApp Cloud API message from a customer phone number.",
  },
  telegram: {
    label: "Receive Telegram bot message",
    description: "Telegram webhook receives a bot message update from a chat.",
  },
  instagram: {
    label: "Receive Instagram DM",
    description: "Instagram Messaging webhook receives a customer direct message.",
  },
  messenger: {
    label: "Receive Messenger message",
    description: "Messenger webhook receives a Page messaging event.",
  },
  email: {
    label: "Receive email",
    description: "Inbound email provider parses an email into a customer message.",
  },
};

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
    position: { x: -620, y: -380 },
    data: {
      kind: "channel",
      label: TRIAGE_CHANNEL_COPY.whatsapp.label,
      description: TRIAGE_CHANNEL_COPY.whatsapp.description,
      badge: "channel",
      channelKind: "whatsapp",
    },
  },
  {
    id: "channel-telegram",
    type: "triage",
    position: { x: -620, y: -190 },
    data: {
      kind: "channel",
      label: TRIAGE_CHANNEL_COPY.telegram.label,
      description: TRIAGE_CHANNEL_COPY.telegram.description,
      badge: "channel",
      channelKind: "telegram",
    },
  },
  {
    id: "channel-instagram",
    type: "triage",
    position: { x: -620, y: 0 },
    data: {
      kind: "channel",
      label: TRIAGE_CHANNEL_COPY.instagram.label,
      description: TRIAGE_CHANNEL_COPY.instagram.description,
      badge: "channel",
      channelKind: "instagram",
    },
  },
  {
    id: "channel-messenger",
    type: "triage",
    position: { x: -620, y: 190 },
    data: {
      kind: "channel",
      label: TRIAGE_CHANNEL_COPY.messenger.label,
      description: TRIAGE_CHANNEL_COPY.messenger.description,
      badge: "channel",
      channelKind: "messenger",
    },
  },
  {
    id: "channel-email",
    type: "triage",
    position: { x: -620, y: 380 },
    data: {
      kind: "channel",
      label: TRIAGE_CHANNEL_COPY.email.label,
      description: TRIAGE_CHANNEL_COPY.email.description,
      badge: "channel",
      channelKind: "email",
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
      channelOverrides: channelOverridesForDecision(decision),
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
  { id: "edge-instagram-complaint", source: "channel-instagram", target: "decision-complaint-refund", type: "smoothstep" },
  { id: "edge-messenger-complaint", source: "channel-messenger", target: "decision-complaint-refund", type: "smoothstep" },
  { id: "edge-email-complaint", source: "channel-email", target: "decision-complaint-refund", type: "smoothstep" },
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
const defaultEdgeIds = new Set(defaultEdges.map((edge) => edge.id));

export function buildDefaultTriageFlow(): TriageFlowDraft {
  return {
    nodes: defaultNodes.map((node) => ({
      ...node,
      position: { ...node.position },
      data: {
        ...node.data,
        triggerTerms: node.data.triggerTerms ? [...node.data.triggerTerms] : undefined,
        channelOverrides: cloneChannelOverrides(node.data.channelOverrides),
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
  const edges = normalizeEdges(draft.edges, nodes);
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
    const decisionNodes = normalizedNodes.filter(
      (candidate) =>
        candidate.data.kind === "decision" &&
        candidate.data.decisionKey === decision.decisionKey,
    );
    if (!decisionNodes.length) {
      throw new TriageFlowValidationError(`Missing decision node ${decision.nodeId}.`);
    }

    const enabledNodes = decisionNodes.filter((node) => node.data.enabled !== false);
    if (!enabledNodes.length) {
      disabledReasonCodes.push(decision.reasonCode);
      continue;
    }

    for (const topic of decision.topics) {
      alwaysEscalateTopics.add(topic);
    }

    const terms = sanitizeTerms(
      enabledNodes.flatMap((node) => node.data.triggerTerms ?? []),
    );
    if (terms.length) {
      rules[decision.ruleField] = terms;
    }
  }

  rules.alwaysEscalateTopics = [...alwaysEscalateTopics];
  if (disabledReasonCodes.length) {
    rules.disabledReasonCodes = disabledReasonCodes;
  }
  const channelRules = compileChannelRules(normalizedNodes);
  if (Object.keys(channelRules).length) {
    rules.channelRules = channelRules;
  }

  return rules;
}

function compileChannelRules(
  nodes: TriageFlowNode[],
): Partial<Record<ChannelKind, Record<string, unknown>>> {
  const channelRules: Partial<Record<ChannelKind, Record<string, unknown>>> = {};
  for (const channelKind of TRIAGE_CHANNELS) {
    const alwaysEscalateTopics = new Set<string>();
    const disabledReasonCodes: string[] = [];
    const rules: Record<string, unknown> = {};
    let hasChannelOverride = false;

    for (const decision of TRIAGE_DECISIONS) {
      const decisionNodes = nodes.filter(
        (candidate) =>
          candidate.data.kind === "decision" &&
          candidate.data.decisionKey === decision.decisionKey,
      );
      const enabledNodes = decisionNodes.filter((node) => node.data.enabled !== false);
      const channelEnabledNodes = enabledNodes.filter((node) => {
        const override = node.data.channelOverrides?.[channelKind];
        if (override) hasChannelOverride = true;
        return override?.enabled !== false;
      });
      if (!channelEnabledNodes.length) {
        disabledReasonCodes.push(decision.reasonCode);
        continue;
      }

      for (const topic of decision.topics) {
        alwaysEscalateTopics.add(topic);
      }

      const terms = sanitizeTerms(
        channelEnabledNodes.flatMap((node) => {
          const overrideTerms = node.data.channelOverrides?.[channelKind]?.triggerTerms;
          return overrideTerms?.length ? overrideTerms : node.data.triggerTerms ?? [];
        }),
      );
      if (terms.length) {
        rules[decision.ruleField] = terms;
      }
    }

    if (!hasChannelOverride) {
      continue;
    }
    rules.alwaysEscalateTopics = [...alwaysEscalateTopics];
    if (disabledReasonCodes.length) {
      rules.disabledReasonCodes = disabledReasonCodes;
    }
    channelRules[channelKind] = rules;
  }
  return channelRules;
}

function normalizeNodes(nodes: unknown[]): TriageFlowNode[] {
  if (nodes.length > MAX_FLOW_NODES) {
    throw new TriageFlowValidationError(`Flow can include at most ${MAX_FLOW_NODES} nodes.`);
  }

  const seen = new Set<string>();
  return nodes.map((node) => {
    if (!node || typeof node !== "object" || Array.isArray(node)) {
      throw new TriageFlowValidationError("Each flow node must be an object.");
    }

    const candidate = node as Partial<TriageFlowNode>;
    if (!candidate.id || typeof candidate.id !== "string" || !FLOW_ID_PATTERN.test(candidate.id)) {
      throw new TriageFlowValidationError("Flow contains an invalid node id.");
    }
    if (seen.has(candidate.id)) {
      throw new TriageFlowValidationError(`Flow contains duplicate node ${candidate.id}.`);
    }
    seen.add(candidate.id);

    const template = defaultNodes.find((defaultNode) => defaultNode.id === candidate.id);
    const position = normalizePosition(candidate.position);
    const inputData = normalizeDataObject(candidate.data);
    const kind = inputData.kind;

    if (!template) {
      if (kind === "decision") {
        const decisionKey = inputData.decisionKey;
        const definition =
          typeof decisionKey === "string"
            ? decisionByKey.get(decisionKey as TriageDecisionKey)
            : undefined;
        if (
          !definition ||
          (inputData.reasonCode !== undefined && inputData.reasonCode !== definition.reasonCode)
        ) {
          throw new TriageFlowValidationError("Flow contains an invalid decision node.");
        }

        return {
          id: candidate.id,
          type: "triage",
          position,
          data: {
            kind: "decision",
            label: sanitizeText(inputData.label, definition.label, MAX_LABEL_LENGTH),
            description: sanitizeText(
              inputData.description,
              definition.description,
              MAX_DESCRIPTION_LENGTH,
            ),
            badge: "decision",
            decisionKey: definition.decisionKey,
            reasonCode: definition.reasonCode,
            enabled: inputData.enabled !== false,
            triggerTerms: sanitizeTerms(
              Array.isArray(inputData.triggerTerms)
                ? inputData.triggerTerms
                : definition.triggerTerms,
            ),
            channelOverrides: normalizeChannelOverrides(
              inputData.channelOverrides,
              definition,
              Array.isArray(inputData.triggerTerms)
                ? sanitizeTerms(inputData.triggerTerms)
                : definition.triggerTerms,
            ),
          },
        };
      }

      if (kind === "note") {
        return {
          id: candidate.id,
          type: "triage",
          position,
          data: {
            kind: "note",
            label: sanitizeText(inputData.label, "Note", MAX_LABEL_LENGTH),
            description: sanitizeText(
              inputData.description,
              "Internal note only. Does not affect runtime behavior.",
              MAX_DESCRIPTION_LENGTH,
            ),
            badge: "note",
          },
        };
      }

      throw new TriageFlowValidationError("Flow contains an unsupported custom node.");
    }

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
          channelOverrides: normalizeChannelOverrides(
            inputData.channelOverrides,
            definition,
            Array.isArray(inputData.triggerTerms)
              ? sanitizeTerms(inputData.triggerTerms)
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
        channelKind: templateData.channelKind,
      },
    };
  });
}

function normalizeEdges(edges: unknown[], nodes: TriageFlowNode[]): TriageFlowEdge[] {
  if (edges.length > MAX_FLOW_EDGES) {
    throw new TriageFlowValidationError(`Flow can include at most ${MAX_FLOW_EDGES} edges.`);
  }

  const nodeIds = new Set(nodes.map((node) => node.id));
  const seen = new Set<string>();
  return edges.map((edge) => {
    if (!edge || typeof edge !== "object" || Array.isArray(edge)) {
      throw new TriageFlowValidationError("Each flow edge must be an object.");
    }
    const candidate = edge as Partial<TriageFlowEdge>;
    if (!candidate.id || typeof candidate.id !== "string" || !FLOW_ID_PATTERN.test(candidate.id)) {
      throw new TriageFlowValidationError("Flow contains an invalid edge id.");
    }
    if (seen.has(candidate.id)) {
      throw new TriageFlowValidationError(`Flow contains duplicate edge ${candidate.id}.`);
    }
    seen.add(candidate.id);

    if (
      typeof candidate.source !== "string" ||
      typeof candidate.target !== "string" ||
      !nodeIds.has(candidate.source) ||
      !nodeIds.has(candidate.target)
    ) {
      throw new TriageFlowValidationError("Flow contains a disconnected edge.");
    }

    const template = defaultEdgeById.get(candidate.id);
    if (template && (candidate.source !== template.source || candidate.target !== template.target)) {
      throw new TriageFlowValidationError("Flow contains a disconnected starter edge.");
    }

    return {
      id: candidate.id,
      source: candidate.source,
      target: candidate.target,
      type: "smoothstep",
      label: sanitizeText(candidate.label, template?.label ?? "", MAX_EDGE_LABEL_LENGTH) || undefined,
      animated: Boolean(candidate.animated),
    };
  });
}

function ensureRequiredGraph(nodes: TriageFlowNode[], edges: TriageFlowEdge[]): void {
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

function channelOverridesForDecision(
  decision: DecisionDefinition,
  baseTerms: string[] = decision.triggerTerms,
): Partial<Record<ChannelKind, TriageChannelOverride>> {
  return Object.fromEntries(
    TRIAGE_CHANNELS.map((channelKind) => [
      channelKind,
      {
        enabled: true,
        triggerTerms: channelOverrideTerms(decision, channelKind, baseTerms),
      },
    ]),
  ) as Partial<Record<ChannelKind, TriageChannelOverride>>;
}

function channelOverrideTerms(
  decision: DecisionDefinition,
  channelKind: ChannelKind,
  baseTerms: string[] = decision.triggerTerms,
): string[] {
  const extraTerms: Partial<Record<ChannelKind, Partial<Record<TriageDecisionKey, string[]>>>> = {
    whatsapp: {
      complaint_or_refund: ["WhatsApp refund", "WhatsApp order issue"],
      transactional_action: ["change my WhatsApp order", "cancel via WhatsApp"],
      human_handoff_requested: ["call me on WhatsApp", "WhatsApp human support"],
    },
    telegram: {
      complaint_or_refund: ["Telegram complaint", "bot refund request"],
      transactional_action: ["cancel from Telegram", "Telegram payment issue"],
      human_handoff_requested: ["Telegram human support", "not a bot"],
    },
    instagram: {
      complaint_or_refund: ["Instagram DM refund", "DM order issue"],
      transactional_action: ["change my DM order", "cancel from Instagram"],
      human_handoff_requested: ["human in DM", "Instagram human support"],
      urgent_or_negative_sentiment: ["angry DM", "upset on Instagram"],
    },
    messenger: {
      complaint_or_refund: ["Messenger complaint", "Page message refund"],
      transactional_action: ["cancel from Messenger", "Messenger payment issue"],
      human_handoff_requested: ["Messenger human support", "Page admin please"],
    },
    email: {
      complaint_or_refund: ["email complaint", "refund request", "missing order"],
      transactional_action: ["cancel by email", "change my email order"],
      human_handoff_requested: ["please call me", "reply from staff"],
      urgent_or_negative_sentiment: ["urgent email", "formal complaint"],
    },
  };
  return sanitizeTerms([
    ...baseTerms,
    ...(extraTerms[channelKind]?.[decision.decisionKey] ?? []),
  ]);
}

function normalizeChannelOverrides(
  input: unknown,
  definition: DecisionDefinition,
  baseTerms: string[],
): Partial<Record<ChannelKind, TriageChannelOverride>> {
  const source =
    input && typeof input === "object" && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};
  const defaults = channelOverridesForDecision(definition, baseTerms);
  const normalized: Partial<Record<ChannelKind, TriageChannelOverride>> = {};

  for (const channelKind of TRIAGE_CHANNELS) {
    const candidate = source[channelKind];
    const fallback = defaults[channelKind];
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
      normalized[channelKind] = fallback;
      continue;
    }
    const override = candidate as Partial<TriageChannelOverride>;
    normalized[channelKind] = {
      enabled: override.enabled !== false,
      triggerTerms: sanitizeTerms(
        Array.isArray(override.triggerTerms)
          ? override.triggerTerms
          : fallback?.triggerTerms ?? definition.triggerTerms,
      ),
    };
  }

  return normalized;
}

function cloneChannelOverrides(
  overrides: Partial<Record<ChannelKind, TriageChannelOverride>> | undefined,
): Partial<Record<ChannelKind, TriageChannelOverride>> | undefined {
  if (!overrides) {
    return undefined;
  }
  const cloned: Partial<Record<ChannelKind, TriageChannelOverride>> = {};
  for (const channelKind of TRIAGE_CHANNELS) {
    const override = overrides[channelKind];
    if (!override) continue;
    cloned[channelKind] = {
      enabled: override.enabled,
      triggerTerms: override.triggerTerms ? [...override.triggerTerms] : undefined,
    };
  }
  return cloned;
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

export function isStarterTriageNode(nodeId: string): boolean {
  return defaultNodeIds.has(nodeId);
}

export function isStarterTriageEdge(edgeId: string): boolean {
  return defaultEdgeIds.has(edgeId);
}
