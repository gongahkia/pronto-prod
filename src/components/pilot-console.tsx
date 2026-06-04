"use client";

import { SendHorizonal } from "lucide-react";
import type { FormEvent } from "react";
import { useState, useTransition } from "react";

type ConsoleEntry = {
  sender: "customer" | "agent" | "system";
  text: string;
};

export function PilotConsole({ clientId }: { clientId: string }) {
  const [text, setText] = useState("");
  const [entries, setEntries] = useState<ConsoleEntry[]>([]);
  const [pending, startTransition] = useTransition();

  function submit(event: FormEvent) {
    event.preventDefault();
    const message = text.trim();
    if (!message) {
      return;
    }

    setText("");
    setEntries((current) => [...current, { sender: "customer", text: message }]);
    startTransition(async () => {
      const response = await fetch("/api/console/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, text: message }),
      });
      const data = await response.json();

      setEntries((current) => [
        ...current,
        {
          sender: data.action === "answered" ? "agent" : "system",
          text:
            data.action === "answered"
              ? data.responseText
              : `Escalated: ${data.reasonCode}`,
        },
      ]);
    });
  }

  return (
    <section className="rounded-lg border border-line bg-panel">
      <div className="border-b border-line p-4">
        <h2 className="text-base font-semibold">Test assistant</h2>
        <p className="text-sm text-muted">Try customer questions without sending live channel traffic.</p>
      </div>
      <div className="flex h-72 flex-col gap-3 overflow-y-auto p-4">
        {entries.length === 0 ? (
          <p className="text-sm text-muted">Try: “Are you open this Sunday?” or “I want a refund now.”</p>
        ) : null}
        {entries.map((entry, index) => (
          <div
            key={`${entry.sender}-${index}`}
            className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
              entry.sender === "customer"
                ? "ml-auto bg-accent text-white"
                : entry.sender === "agent"
                  ? "bg-stone-100 text-foreground"
                  : "bg-amber-50 text-amber-900"
            }`}
          >
            {entry.text}
          </div>
        ))}
      </div>
      <form onSubmit={submit} className="flex gap-2 border-t border-line p-4">
        <input
          value={text}
          onChange={(event) => setText(event.target.value)}
          className="min-w-0 flex-1 rounded-md border border-line bg-white px-3 py-2 text-sm outline-none focus:border-accent"
          placeholder="Send a customer question"
        />
        <button
          disabled={pending}
          className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-accent text-white hover:bg-teal-800 disabled:opacity-50"
          title="Send"
        >
          <SendHorizonal size={16} />
        </button>
      </form>
    </section>
  );
}
