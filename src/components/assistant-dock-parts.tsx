"use client";

import { ExternalLink, Wand2 } from "lucide-react";
import type { ReactNode } from "react";

export type AssistantMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  body: string;
  metadata?: {
    citedRecords?: AssistantCitation[];
    followUpQuestions?: string[];
    nextActions?: AssistantNextAction[];
    result?: {
      nextActions?: AssistantNextAction[];
    };
  };
};

export type AssistantCitation = {
  type: string;
  id: string;
  label: string;
  href?: string;
};

export type AssistantThread = {
  id: string;
  title: string;
  updated_at: string;
};

export type AssistantProposal = {
  id: string;
  action_type: string;
  title: string;
  description: string;
  payload: Record<string, unknown>;
  status: "pending" | "confirmed" | "executed" | "failed" | "cancelled";
  requires_typed_confirmation: string | null;
  result?: {
    nextActions?: AssistantNextAction[];
  } | null;
  error?: string | null;
};

export type AssistantNextAction = {
  label: string;
  href?: string;
  prompt?: string;
  proposal?: {
    actionType: string;
    title: string;
    description: string;
    payload: Record<string, unknown>;
  };
};

export function MessageBubble({ message }: { message: AssistantMessage }) {
  const isUser = message.role === "user";
  const citations = message.metadata?.citedRecords ?? [];
  const nextActions =
    message.metadata?.nextActions ?? message.metadata?.result?.nextActions ?? [];
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[88%] rounded-lg px-3 py-2 text-sm ${
          isUser
            ? "bg-accent text-white"
            : message.role === "system"
              ? "border border-line bg-surface text-muted"
              : "bg-surface text-foreground"
        }`}
      >
        <p className="whitespace-pre-wrap">{message.body}</p>
        {!isUser && citations.length ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {citations.map((citation, index) =>
              citation.href ? (
                <a
                  key={`${citation.type}:${citation.id}:${index}`}
                  href={citation.href}
                  className="rounded-full bg-panel px-2 py-1 text-[11px] font-medium text-link"
                >
                  {citation.label}
                </a>
              ) : (
                <span
                  key={`${citation.type}:${citation.id}:${index}`}
                  className="rounded-full bg-panel px-2 py-1 text-[11px] font-medium text-muted"
                >
                  {citation.label}
                </span>
              ),
            )}
          </div>
        ) : null}
        {!isUser && nextActions.length ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {nextActions.map((action) =>
              action.href ? (
                <a
                  key={`${message.id}:${action.label}`}
                  href={action.href}
                  className="inline-flex items-center gap-1 rounded-full bg-panel px-2 py-1 text-[11px] font-medium text-link"
                >
                  {action.label}
                  <ExternalLink size={11} />
                </a>
              ) : action.prompt || action.proposal ? (
                <button
                  key={`${message.id}:${action.label}`}
                  type="button"
                  onClick={() => {
                    const prompt =
                      action.prompt ??
                      `Propose this action for review: ${action.proposal?.title}\n${action.proposal?.description}\nPayload:\n${JSON.stringify(action.proposal?.payload ?? {}, null, 2)}`;
                    const event = new CustomEvent("pronto-assistant-prompt", {
                      detail: prompt,
                    });
                    window.dispatchEvent(event);
                  }}
                  className="inline-flex items-center gap-1 rounded-full bg-panel px-2 py-1 text-[11px] font-medium text-link"
                >
                  <Wand2 size={11} />
                  {action.label}
                </button>
              ) : null,
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function ActionPayloadEditor({
  proposal,
  payload,
  jsonValue,
  error,
  onFieldChange,
  onJsonChange,
}: {
  proposal: AssistantProposal;
  payload: Record<string, unknown>;
  jsonValue: string;
  error?: string;
  onFieldChange: (proposalId: string, field: string, value: unknown) => void;
  onJsonChange: (proposalId: string, value: string) => void;
}) {
  const action = proposal.action_type;

  if (action === "escalation_resolve") {
    return (
      <PayloadSection>
        <TextAreaField
          label="Customer reply"
          value={stringValue(payload.reply)}
          rows={4}
          onChange={(value) => onFieldChange(proposal.id, "reply", value)}
        />
      </PayloadSection>
    );
  }

  if (action === "knowledge_refresh_create") {
    return (
      <PayloadSection>
        <InputField
          label="Cadence"
          value={stringValue(payload.cadence) || "monthly"}
          onChange={(value) => onFieldChange(proposal.id, "cadence", value)}
        />
        <TextAreaField
          label="Notes"
          value={stringValue(payload.notes)}
          rows={3}
          onChange={(value) => onFieldChange(proposal.id, "notes", value)}
        />
      </PayloadSection>
    );
  }

  if (action === "assistant_request_create") {
    return (
      <PayloadSection>
        <SelectField
          label="Kind"
          value={stringValue(payload.kind) || "assistant_change"}
          options={["assistant_change", "handoff_rule", "tone", "scope", "other"]}
          onChange={(value) => onFieldChange(proposal.id, "kind", value)}
        />
        <TextAreaField
          label="Request"
          value={stringValue(payload.body)}
          rows={4}
          onChange={(value) => onFieldChange(proposal.id, "body", value)}
        />
      </PayloadSection>
    );
  }

  if (action === "knowledge_create" || action === "knowledge_update") {
    return (
      <PayloadSection>
        <InputField
          label="Title"
          value={stringValue(payload.title)}
          onChange={(value) => onFieldChange(proposal.id, "title", value)}
        />
        <TextAreaField
          label="Content"
          value={stringValue(payload.content)}
          rows={5}
          onChange={(value) => onFieldChange(proposal.id, "content", value)}
        />
      </PayloadSection>
    );
  }

  if (action === "review_create") {
    return (
      <PayloadSection>
        <SelectField
          label="Answer label"
          value={stringValue(payload.answerLabel) || "answered_correctly"}
          options={[
            "answered_correctly",
            "should_have_escalated",
            "over_escalated",
            "hallucinated",
            "needs_knowledge_update",
          ]}
          onChange={(value) => onFieldChange(proposal.id, "answerLabel", value)}
        />
        <TextAreaField
          label="Notes"
          value={stringValue(payload.notes)}
          rows={3}
          onChange={(value) => onFieldChange(proposal.id, "notes", value)}
        />
        <CheckboxField
          label="Knowledge update needed"
          checked={payload.knowledgeUpdateNeeded === true}
          onChange={(value) => onFieldChange(proposal.id, "knowledgeUpdateNeeded", value)}
        />
      </PayloadSection>
    );
  }

  if (action === "client_create") {
    return (
      <PayloadSection>
        <InputField
          label="Name"
          value={stringValue(payload.name)}
          onChange={(value) => onFieldChange(proposal.id, "name", value)}
        />
        <InputField
          label="Vertical"
          value={stringValue(payload.vertical)}
          onChange={(value) => onFieldChange(proposal.id, "vertical", value)}
        />
        <SelectField
          label="Status"
          value={stringValue(payload.status) || "draft"}
          options={["draft", "pilot", "live", "paused"]}
          onChange={(value) => onFieldChange(proposal.id, "status", value)}
        />
      </PayloadSection>
    );
  }

  if (action === "commercial_update") {
    return (
      <PayloadSection>
        {[
          "monthlyRetainerSgd",
          "setupFeeSgd",
          "hostingCostSgd",
          "integrationCostSgd",
          "includedConversations",
        ].map((field) => (
          <InputField
            key={field}
            label={field}
            type="number"
            value={stringValue(payload[field])}
            onChange={(value) => onFieldChange(proposal.id, field, Number(value))}
          />
        ))}
      </PayloadSection>
    );
  }

  return (
    <PayloadSection>
      <TextAreaField
        label="Payload JSON"
        value={jsonValue}
        rows={6}
        onChange={(value) => onJsonChange(proposal.id, value)}
      />
      {error ? <p className="text-xs text-danger">{error}</p> : null}
    </PayloadSection>
  );
}

function PayloadSection({ children }: { children: ReactNode }) {
  return <div className="mt-3 space-y-2 rounded-md border border-line bg-panel p-2">{children}</div>;
}

function InputField({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: "text" | "number";
}) {
  return (
    <label className="block text-xs font-medium text-muted">
      {label}
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded-md border border-line bg-panel px-2 py-1.5 text-sm text-foreground"
      />
    </label>
  );
}

function TextAreaField({
  label,
  value,
  rows,
  onChange,
}: {
  label: string;
  value: string;
  rows: number;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block text-xs font-medium text-muted">
      {label}
      <textarea
        value={value}
        rows={rows}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full resize-y rounded-md border border-line bg-panel px-2 py-1.5 text-sm text-foreground"
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="block text-xs font-medium text-muted">
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded-md border border-line bg-panel px-2 py-1.5 text-sm text-foreground"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function CheckboxField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-xs font-medium text-muted">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      {label}
    </label>
  );
}

function stringValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  return String(value);
}
