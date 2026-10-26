"use client";

import dynamic from "next/dynamic";
import { useState, type ReactNode } from "react";
import { GitBranch, MessagesSquare } from "lucide-react";
import type { ConversationDecision } from "@/lib/conversation-decision-flow";
const DecisionFlow = dynamic(() => import("@/components/conversation-decision-flow"), {
  ssr: false, loading: () => <p role="status" className="ui-panel p-6 text-sm text-muted">Loading decision flow…</p>,
});

export function ConversationTabs({ children, decisions }: { children: ReactNode; decisions: ConversationDecision[] }) {
  const [tab, setTab] = useState("conversation");
  return <div className="min-w-0">
    <div role="tablist" aria-label="Conversation views" className="mb-4 flex gap-1 border-b border-line">
      {[{ id: "conversation", label: "Conversation", Icon: MessagesSquare }, { id: "decision-flow", label: "Decision flow", Icon: GitBranch }].map(({ id, label, Icon }) =>
        <button key={id} id={`tab-${id}`} role="tab" aria-selected={tab === id} aria-controls={`panel-${id}`}
          tabIndex={tab === id ? 0 : -1} onClick={() => setTab(id)}
          onKeyDown={event => {
            if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
              event.preventDefault();
              const next = event.key === "Home" ? "conversation" : event.key === "End" ? "decision-flow" : tab === "conversation" ? "decision-flow" : "conversation";
              setTab(next); document.getElementById(`tab-${next}`)?.focus();
            }
          }} className={`inline-flex items-center gap-2 border-b-2 px-3 py-3 text-sm font-medium ${tab === id ? "border-accent text-accent" : "border-transparent text-muted hover:text-foreground"}`}>
          <Icon size={17} aria-hidden="true"/>{label}
        </button>)}
    </div>
    <div id="panel-conversation" role="tabpanel" aria-labelledby="tab-conversation" hidden={tab !== "conversation"}>{children}</div>
    {tab === "decision-flow" && <div id="panel-decision-flow" role="tabpanel" aria-labelledby="tab-decision-flow"><DecisionFlow decisions={decisions}/></div>}
  </div>;
}
