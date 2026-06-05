import { describe, expect, it } from "vitest";
import { evaluatePreGenerationGuardrails } from "@/lib/agent/guardrails";
import {
  buildDefaultTriageFlow,
  compileTriageFlowToEscalationRules,
  validateAndNormalizeTriageFlow,
} from "@/lib/triage-flow";

describe("triage flow compiler", () => {
  it("compiles the starter complaint triage template into guardrail rules", () => {
    const flow = buildDefaultTriageFlow();
    const rules = compileTriageFlowToEscalationRules(flow.nodes);

    expect(rules).toMatchObject({
      source: "triage_flow",
      version: 1,
      alwaysEscalateTopics: expect.arrayContaining([
        "refund_dispute",
        "complaint",
        "booking_mutation",
        "payment",
        "human_handoff",
        "medical_or_legal",
        "severe_allergy",
        "out_of_scope",
      ]),
      complaintOrRefundTerms: expect.arrayContaining(["refund", "missing item"]),
      sentimentTriggers: expect.arrayContaining(["urgent", "frustrated"]),
    });
  });

  it("maps edited trigger terms into runtime guardrails", () => {
    const flow = buildDefaultTriageFlow();
    const sentimentNode = flow.nodes.find(
      (node) => node.data.decisionKey === "urgent_or_negative_sentiment",
    );
    expect(sentimentNode).toBeTruthy();
    sentimentNode!.data.triggerTerms = ["annoyed"];

    const rules = compileTriageFlowToEscalationRules(flow.nodes);
    const result = evaluatePreGenerationGuardrails("I am properly annoyed.", rules);

    expect(result.shouldEscalate).toBe(true);
    expect(result.reasonCode).toBe("urgent_or_negative_sentiment");
  });

  it("turns disabled decisions into disabled reason codes", () => {
    const flow = buildDefaultTriageFlow();
    const outOfScopeNode = flow.nodes.find(
      (node) => node.data.decisionKey === "out_of_scope",
    );
    expect(outOfScopeNode).toBeTruthy();
    outOfScopeNode!.data.enabled = false;

    const rules = compileTriageFlowToEscalationRules(flow.nodes);
    const result = evaluatePreGenerationGuardrails("Do you have karaoke rooms?", rules);

    expect(rules.disabledReasonCodes).toEqual(["out_of_scope"]);
    expect(result.shouldEscalate).toBe(false);
  });

  it("merges duplicate approved decision nodes into the same guardrail rule", () => {
    const flow = buildDefaultTriageFlow();
    flow.nodes.push({
      id: "decision-complaint-custom",
      type: "triage",
      position: { x: 100, y: 100 },
      data: {
        kind: "decision",
        label: "Missing sauces",
        description: "Custom label mapped to the existing complaint category.",
        badge: "decision",
        decisionKey: "complaint_or_refund",
        reasonCode: "complaint_or_refund",
        enabled: true,
        triggerTerms: ["missing sambal"],
      },
    });
    flow.edges.push({
      id: "edge-complaint-custom-note",
      source: "decision-complaint-custom",
      target: "outcome-owner-triage",
      type: "smoothstep",
    });

    const normalized = validateAndNormalizeTriageFlow(flow);
    const rules = compileTriageFlowToEscalationRules(normalized.nodes);

    expect(rules.complaintOrRefundTerms).toEqual(
      expect.arrayContaining(["refund", "missing sambal"]),
    );
  });

  it("accepts freeform note nodes without changing runtime guardrails", () => {
    const flow = buildDefaultTriageFlow();
    flow.nodes.push({
      id: "note-refund-policy",
      type: "triage",
      position: { x: 120, y: 140 },
      data: {
        kind: "note",
        label: "Watch refunds",
        description: "Internal client note only.",
        badge: "note",
      },
    });
    flow.edges.push({
      id: "edge-note-refund",
      source: "note-refund-policy",
      target: "decision-complaint-refund",
      type: "smoothstep",
    });

    const normalized = validateAndNormalizeTriageFlow(flow);
    const rules = compileTriageFlowToEscalationRules(normalized.nodes);

    expect(normalized.nodes.some((node) => node.data.kind === "note")).toBe(true);
    expect(JSON.stringify(rules)).not.toContain("Watch refunds");
  });

  it("rejects arbitrary custom decision reason codes", () => {
    const flow = buildDefaultTriageFlow();
    const decisionNode = flow.nodes.find(
      (node) => node.data.decisionKey === "complaint_or_refund",
    );
    expect(decisionNode).toBeTruthy();
    decisionNode!.data.reasonCode = "custom_runtime_policy";

    expect(() => validateAndNormalizeTriageFlow(flow)).toThrow(
      "Flow contains an invalid decision node.",
    );
  });

  it("rejects disconnected or unknown edges", () => {
    const flow = buildDefaultTriageFlow();
    flow.edges[0] = {
      ...flow.edges[0],
      target: "outcome-answer",
    };

    expect(() => validateAndNormalizeTriageFlow(flow)).toThrow(
      "Flow contains a disconnected starter edge.",
    );
  });
});
