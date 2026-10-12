"use client";

import { useState, type FormEvent } from "react";

type Pending = { id: string; token: string; summary: string; expiresAt: string };

export function StaffCommandPanel() {
  const [message, setMessage] = useState("");
  const [reply, setReply] = useState("");
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);

  async function send(event: FormEvent) {
    event.preventDefault();
    if (!message.trim() || busy) return;
    setBusy(true); setReply(""); setPending(null);
    try {
      const response = await fetch("/api/client/staff-interaction", {
        method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "send", text: message.trim(), requestKey: crypto.randomUUID() }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Pronto could not process this request.");
      if (result.state === "view") {
        setReply(result.policy?.targetMinutes == null ? "No response target is configured."
          : `Current response target: ${result.policy.targetMinutes} minutes. This is an operating target, not a guarantee.`);
      } else if (result.confirmationToken && result.id) {
        setPending({ id: result.id, token: result.confirmationToken,
          summary: result.summary, expiresAt: result.expiresAt });
        setReply("Review this proposal, then confirm it within 10 minutes.");
      } else setReply(result.summary ?? "This request has already been received.");
    } catch (error) {
      setReply(error instanceof Error ? error.message : "Request failed.");
    } finally { setBusy(false); }
  }

  async function confirm() {
    if (!pending || busy) return;
    setBusy(true);
    try {
      const response = await fetch("/api/client/staff-interaction", {
        method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "confirm", requestId: pending.id, confirmationToken: pending.token }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Confirmation failed.");
      setReply(result.resultReference
        ? "Knowledge suggestion submitted for review. Customer answers have not changed."
        : "Response target saved. Refresh Connected Channels to see the current setting.");
      setPending(null);
    } catch (error) {
      setReply(error instanceof Error ? error.message : "Confirmation failed.");
      setPending(null);
    } finally { setBusy(false); }
  }

  return <div className="ui-panel p-4">
    <h2 className="font-semibold">Message Pronto</h2>
    <p className="mt-1 text-sm text-muted">Local authenticated demonstration. No real WhatsApp, Instagram or email command is sent.</p>
    <form onSubmit={send} className="mt-4 grid gap-3">
      <label className="text-sm">Your request<textarea value={message} onChange={(event) => setMessage(event.target.value)}
        required rows={3} maxLength={9000} className="ui-input mt-1 block w-full px-3 py-2"/></label>
      <button disabled={busy} className="ui-primary-button w-fit px-4 py-2">Send request</button>
    </form>
    {reply ? <p role="status" className="mt-4 rounded border border-line p-3 text-sm">{reply}</p> : null}
    {pending ? <div className="mt-3 rounded border border-warning/40 bg-warning-bg p-4 text-sm">
      <p className="font-medium">Confirm this exact change</p><p className="mt-1">{pending.summary}</p>
      <p className="mt-1 text-xs text-muted">Expires {new Date(pending.expiresAt).toLocaleTimeString()}.</p>
      <div className="mt-3 flex gap-2"><button disabled={busy} onClick={confirm} className="ui-primary-button px-3 py-2">Confirm change</button>
        <button onClick={() => { setPending(null); setReply("Change cancelled. Nothing was saved."); }} className="ui-button px-3 py-2">Cancel</button></div>
    </div> : null}
    <details className="mt-5 text-sm"><summary className="cursor-pointer font-medium">Supported requests</summary>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-muted">
        <li>Show escalation policy</li><li>Change our escalation response target to 30 minutes</li>
        <li>Change our escalation response target to unset</li>
        <li>Suggest knowledge: Title | Proposed answer | Reason | Source (optional)</li>
      </ul></details>
  </div>;
}
