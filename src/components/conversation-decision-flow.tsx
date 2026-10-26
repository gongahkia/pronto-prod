"use client";

import { useState } from "react";
import { Background, Controls, Handle, MarkerType, Position, ReactFlow, type Node, type NodeProps } from "@xyflow/react";
import { BookOpenText, CheckCheck, GitBranch, MessageCircle, Send, ShieldCheck, Sparkles } from "lucide-react";
import type { ConversationDecision, DecisionStep } from "@/lib/conversation-decision-flow";
import { formatDateTime } from "@/lib/date-format";

type DecisionNode = Node<DecisionStep, "decision">;
const icons = { message: MessageCircle, rule: GitBranch, knowledge: BookOpenText, model: Sparkles,
  check: ShieldCheck, outcome: CheckCheck, delivery: Send };
function DecisionFlowNode({ data }: NodeProps<DecisionNode>) {
  const Icon = icons[data.kind];
  return <div className={`w-[280px] rounded-xl border bg-panel p-4 shadow-sm ${data.tone === "attention"
    ? "border-warning/40" : data.tone === "success" ? "border-success/30" : "border-line"}`}>
    <Handle type="target" position={Position.Top} className="!border-line !bg-muted"/>
    <div className="mb-2 flex items-center gap-2 text-sm font-semibold"><Icon size={17} aria-hidden="true"
      className={data.tone === "attention" ? "text-warning" : data.tone === "success" ? "text-success" : "text-accent"}/>{data.title}</div>
    <p className="line-clamp-4 whitespace-pre-wrap break-words text-xs leading-5 text-muted">{data.description}</p>
    <Handle type="source" position={Position.Bottom} className="!border-line !bg-muted"/>
  </div>;
}
const nodeTypes = { decision: DecisionFlowNode };

export default function ConversationDecisionFlow({ decisions }: { decisions: ConversationDecision[] }) {
  const [selectedId, setSelectedId] = useState(decisions.at(-1)?.id ?? "");
  const selected = decisions.find(decision => decision.id === selectedId) ?? decisions.at(-1);
  if (!selected) return <div className="ui-panel p-6 text-sm text-muted">A decision flow will appear after the first customer message.</div>;
  const nodes: DecisionNode[] = selected.steps.map((step, index) => ({ id: step.id, type: "decision",
    position: { x: 0, y: index * 195 }, data: step }));
  const edges = selected.steps.slice(1).map((step, index) => ({ id: `${selected.id}-edge-${index}`,
    source: selected.steps[index].id, target: step.id, type: "smoothstep",
    markerEnd: { type: MarkerType.ArrowClosed, color: "#94a3b8" }, style: { stroke: "#94a3b8", strokeWidth: 1.5 } }));
  return <section className="ui-panel min-w-0 overflow-hidden" aria-label="Decision flow">
    <div className="space-y-3 border-b border-line p-4">
      <div><h2 className="font-semibold">Decision flow</h2><p className="mt-1 text-sm text-muted">The saved steps and decision explanation for each customer message.</p></div>
      <label className="block text-sm font-medium">Customer message
        <select className="ui-input mt-1 w-full px-3 py-2 text-sm" value={selected.id} onChange={event => setSelectedId(event.target.value)}>
          {decisions.map((decision, index) => <option key={decision.id} value={decision.id}>{index + 1}. {decision.message.slice(0, 100)}</option>)}
        </select>
      </label>
      <p className="text-xs text-muted">{formatDateTime(selected.createdAt)} · {selected.status}</p>
    </div>
    <div className="h-[620px] w-full bg-surface/50" aria-label="Recorded decision diagram">
      <ReactFlow key={selected.id} nodes={nodes} edges={edges} nodeTypes={nodeTypes} nodesDraggable={false} nodesConnectable={false}
        edgesFocusable={false} fitView fitViewOptions={{ padding: 0.15, maxZoom: 0.9 }} minZoom={0.25} maxZoom={1.5} colorMode="light">
        <Background color="#d8dee9" gap={20}/><Controls showInteractive={false}/>
      </ReactFlow>
    </div>
    <details className="border-t border-line p-4 text-sm"><summary className="cursor-pointer font-medium">Read decision steps</summary>
      <ol className="mt-3 space-y-3">{selected.steps.map(step => <li key={step.id}><p className="font-medium">{step.title}</p><p className="mt-1 text-muted">{step.description}</p></li>)}</ol>
    </details>
  </section>;
}
