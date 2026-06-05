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
      "Flow contains a disconnected edge.",
    );
  });
});
