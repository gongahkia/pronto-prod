"use client";

import { useState } from "react";
import { Background, Controls, Handle, MarkerType, Position, ReactFlow, type Node, type NodeProps } from "@xyflow/react";
import { BookOpenText, CheckCheck, FileText, GitBranch, MessageCircle, Send, ShieldCheck, Sparkles } from "lucide-react";
import type { ConversationDecision, DecisionStep, DecisionSource } from "@/lib/conversation-decision-flow";
import { formatDateTime } from "@/lib/date-format";

type DecisionNode = Node<DecisionStep, "decision">;
type SourceNode = Node<DecisionSource, "source">;
function sourceHref(url: string | null) {
  try { const parsed = new URL(url ?? ""); return ["http:", "https:"].includes(parsed.protocol) ? parsed.href : undefined; }
  catch { return undefined; }
}
const icons = { message: MessageCircle, rule: GitBranch, knowledge: BookOpenText, model: Sparkles,
  check: ShieldCheck, outcome: CheckCheck, delivery: Send };
function DecisionFlowNode({ data }: NodeProps<DecisionNode>) {
  const Icon = icons[data.kind];
  return <div className={`w-[280px] rounded-xl border bg-panel p-4 shadow-sm ${data.tone === "attention"
    ? "border-warning/40" : data.tone === "success" ? "border-success/30" : "border-line"}`}>
    <Handle type="target" position={Position.Top} className="!border-line !bg-muted"/>
    {data.kind === "knowledge" && <Handle type="target" position={Position.Left} id="sources" className="!border-line !bg-muted"/>}
    <div className="mb-2 flex items-center gap-2 text-sm font-semibold"><Icon size={17} aria-hidden="true"
      className={data.tone === "attention" ? "text-warning" : data.tone === "success" ? "text-success" : "text-accent"}/>{data.title}</div>
    <p className="line-clamp-4 whitespace-pre-wrap break-words text-xs leading-5 text-muted">{data.description}</p>
    {data.modelLabel && <p className="mt-2 rounded-md bg-accent-soft px-2 py-1 text-[11px] text-accent">{data.modelLabel}</p>}
    <Handle type="source" position={Position.Bottom} className="!border-line !bg-muted"/>
  </div>;
}
function SourceFlowNode({ data }: NodeProps<SourceNode>) {
  const href = sourceHref(data.url);
  return <div className={`w-[260px] rounded-xl border bg-panel p-4 shadow-sm ${data.cited ? "border-accent/40" : "border-line"}`}>
    <div className="mb-2 flex items-start gap-2"><FileText size={17} className="mt-0.5 shrink-0 text-accent" aria-hidden="true"/>
      <p className="text-xs font-semibold leading-5">{data.title}</p></div>
    <p className={`mb-2 text-[11px] font-medium ${data.cited ? "text-accent" : "text-muted"}`}>{data.cited ? "Cited in response" : "Retrieved context"}</p>
    {data.excerpt && <p className="mb-2 line-clamp-3 text-[11px] leading-4 text-muted">{data.excerpt}</p>}
    {href && <a href={href} target="_blank" rel="noopener noreferrer" onClick={event => event.stopPropagation()}
      className="nodrag nopan text-[11px] text-accent underline">View source document</a>}
    <Handle type="source" position={Position.Right} className="!border-line !bg-muted"/>
  </div>;
}
const nodeTypes = { decision: DecisionFlowNode, source: SourceFlowNode };

export default function ConversationDecisionFlow({ decisions }: { decisions: ConversationDecision[] }) {
  const [selectedId, setSelectedId] = useState(decisions.at(-1)?.id ?? "");
  const selected = decisions.find(decision => decision.id === selectedId) ?? decisions.at(-1);
  if (!selected) return <div className="ui-panel p-6 text-sm text-muted">A decision flow will appear after the first customer message.</div>;
  const nodes: (DecisionNode | SourceNode)[] = selected.steps.map((step, index) => ({ id: step.id, type: "decision",
    position: { x: 0, y: index * 195 }, data: step }));
  const edges = selected.steps.slice(1).map((step, index) => ({ id: `${selected.id}-edge-${index}`,
    source: selected.steps[index].id, target: step.id, type: "smoothstep",
    targetHandle: undefined as string | undefined,
    markerEnd: { type: MarkerType.ArrowClosed, color: "#94a3b8" }, style: { stroke: "#94a3b8", strokeWidth: 1.5 } }));
  selected.steps.forEach((step, stepIndex) => step.sources?.forEach((source, sourceIndex, sources) => {
    const id = `${step.id}-source-${sourceIndex}`;
    nodes.push({ id, type: "source", position: { x: -360, y: stepIndex * 195 + sourceIndex * 240 - (sources.length - 1) * 120 }, data: source });
    edges.push({ id: `${id}-edge`, source: id, target: step.id, targetHandle: "sources", type: "smoothstep",
      markerEnd: { type: MarkerType.ArrowClosed, color: "#94a3b8" }, style: { stroke: "#94a3b8", strokeWidth: 1.5 } });
  }));
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
      <ol className="mt-3 space-y-3">{selected.steps.map(step => <li key={step.id}><p className="font-medium">{step.title}</p>
        {step.modelLabel && <p className="mt-1 text-xs text-accent">{step.modelLabel}</p>}
        <p className="mt-1 text-muted">{step.description}</p>
        {step.sources?.length ? <ul className="mt-2 space-y-2 border-l border-line pl-3">{step.sources.map(source => <li key={source.chunkId}>
          <p className="font-medium">{sourceHref(source.url) ? <a href={sourceHref(source.url)} target="_blank" rel="noopener noreferrer" className="text-accent underline">{source.title}</a> : source.title}</p>
          <p className="text-xs text-muted">{source.cited ? "Cited in response" : "Retrieved context"}{source.version != null ? ` · Version ${source.version}` : ""}</p>
          {source.excerpt && <p className="mt-1 text-xs leading-5 text-muted">{source.excerpt}</p>}
        </li>)}</ul> : null}
      </li>)}</ol>
    </details>
  </section>;
}
