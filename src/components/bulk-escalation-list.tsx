"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { EscalationWithContext } from "@/lib/dashboard";

export type BulkEscalationListProps = {
  clientId: string;
  escalations: EscalationWithContext[];
  staff: { id: string; name: string; email: string }[];
  hrefForConversation: (escalationId: string, conversationId: string) => string;
  allowAssign: boolean;
};

type ActionState =
  | { kind: "idle" }
  | { kind: "running"; action: string }
  | { kind: "success"; message: string }
  | { kind: "error"; message: string };

export function BulkEscalationList(props: BulkEscalationListProps) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [assigneeUserId, setAssigneeUserId] = useState<string>(props.staff[0]?.id ?? "");
  const [resolutionNote, setResolutionNote] = useState<string>("");
  const [state, setState] = useState<ActionState>({ kind: "idle" });
  const [isPending, startTransition] = useTransition();

  const allIds = useMemo(
    () => props.escalations.map((escalation) => escalation.id),
    [props.escalations],
  );

  const allSelected = allIds.length > 0 && selected.size === allIds.length;

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(allIds));
  }

  async function runBulk(action: "bulk_claim" | "bulk_assign" | "bulk_resolve") {
    if (!selected.size) {
      setState({ kind: "error", message: "Select at least one escalation." });
      return;
    }
    if (action === "bulk_assign" && !assigneeUserId) {
      setState({ kind: "error", message: "Choose an assignee." });
      return;
    }
    setState({ kind: "running", action });
    const body = new FormData();
    body.set("action", action);
    body.set("clientId", props.clientId);
    for (const id of selected) {
      body.append("escalationIds", id);
    }
    if (action === "bulk_assign") {
      body.set("assigneeUserId", assigneeUserId);
    }
    if (action === "bulk_resolve" && resolutionNote.trim()) {
      body.set("resolutionNote", resolutionNote.trim());
    }

    try {
      const response = await fetch("/api/escalations", { method: "POST", body });
      if (!response.ok) {
        setState({ kind: "error", message: await responseErrorMessage(response) });
        return;
      }
      const json = (await response.json()) as {
        attempted: number;
        applied: number;
        skipped: string[];
      };
      setState({
        kind: "success",
        message: `Applied to ${json.applied} of ${json.attempted}. Skipped ${json.skipped.length}.`,
      });
      setSelected(new Set());
      setResolutionNote("");
      startTransition(() => router.refresh());
    } catch (error) {
      setState({
        kind: "error",
        message: error instanceof Error ? error.message : "Bulk action failed.",
      });
    }
  }

  return (
    <div className="space-y-4">
      <fieldset className="flex flex-wrap items-center gap-3 rounded border border-line bg-surface p-3 text-sm">
        <legend className="px-1 text-xs font-semibold text-muted">
          Bulk escalation selection
        </legend>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={toggleAll}
            aria-label="Select all"
          />
          <span>{selected.size} selected of {allIds.length}</span>
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="ui-button px-3 py-1"
            disabled={!selected.size || isPending || state.kind === "running"}
            onClick={() => runBulk("bulk_claim")}
          >
            Claim
          </button>
          {props.allowAssign && (
            <>
              <select
                className="ui-input px-2 py-1"
                value={assigneeUserId}
                onChange={(event) => setAssigneeUserId(event.target.value)}
                disabled={!props.staff.length || isPending}
              >
                {props.staff.length === 0 && <option value="">No staff users</option>}
                {props.staff.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name} ({user.email})
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="ui-button px-3 py-1"
                disabled={
                  !selected.size ||
                  isPending ||
                  !assigneeUserId ||
                  state.kind === "running"
                }
                onClick={() => runBulk("bulk_assign")}
              >
                Assign
              </button>
            </>
          )}
          <input
            type="text"
            className="ui-input px-2 py-1"
            placeholder="Optional resolution note"
            value={resolutionNote}
            onChange={(event) => setResolutionNote(event.target.value)}
          />
          <button
            type="button"
            className="ui-danger-button px-3 py-1"
            disabled={!selected.size || isPending || state.kind === "running"}
            onClick={() => runBulk("bulk_resolve")}
          >
            Resolve
          </button>
        </div>
        {state.kind === "success" && (
          <p className="text-xs text-success">{state.message}</p>
        )}
        {state.kind === "error" && (
          <p className="text-xs text-danger">{state.message}</p>
        )}
        {state.kind === "running" && (
          <p className="text-xs text-muted">Running {state.action}…</p>
        )}
      </fieldset>

      <ul className="divide-y divide-line rounded border border-line">
        {props.escalations.length === 0 && (
          <li className="px-4 py-6 text-center text-sm text-muted">
            No open escalations.
          </li>
        )}
        {props.escalations.map((escalation) => (
          <li key={escalation.id} className="flex items-start gap-3 px-4 py-3 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={selected.has(escalation.id)}
              onChange={() => toggle(escalation.id)}
              aria-label={`Select escalation ${escalation.id}`}
            />
            <div className="flex-1">
              <div className="flex flex-wrap items-baseline gap-3">
                <Link
                  className="font-medium text-accent"
                  href={props.hrefForConversation(escalation.id, escalation.conversation_id)}
                >
                  {escalation.customer_handle ?? "unknown customer"}
                </Link>
                <span className="text-xs text-muted">
                  {escalation.reason_code}
                </span>
                <span className="font-mono text-xs text-muted">
                  {escalation.status}
                </span>
                <time className="ml-auto font-mono text-xs text-muted" dateTime={escalation.created_at.toISOString()}>
                  {escalation.created_at.toISOString()}
                </time>
              </div>
              <p className="mt-1 text-sm">{escalation.customer_message}</p>
              <p className="mt-1 text-xs text-muted">{escalation.reason_detail}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

async function responseErrorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: unknown };
    return typeof body.error === "string" && body.error ? body.error : "Bulk action failed.";
  } catch {
    return "Bulk action failed.";
  }
}
