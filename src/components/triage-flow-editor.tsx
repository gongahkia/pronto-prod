"use client";

import {
  AlertTriangle,
  Bot,
  Braces,
  CalendarClock,
  CheckCircle2,
  CircleAlert,
  Database,
  FileText,
  GitBranch,
  Globe2,
  Headphones,
  MessageCircle,
  MessageSquare,
  Plus,
  RotateCcw,
  Save,
  Send,
  Settings2,
  ShieldAlert,
  SlidersHorizontal,
  Trash2,
  UserRoundCheck,
  Wand2,
  Workflow,
  Zap,
  type LucideIcon,
} from "lucide-react";
import {
  Background,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type EdgeChange,
  type NodeChange,
  type NodeProps,
  type NodeTypes,
  type ReactFlowInstance,
} from "@xyflow/react";
import { useCallback, useMemo, useState } from "react";
import {
  buildDefaultTriageFlow,
  compileTriageFlowToEscalationRules,
  decisionDefinitionForKey,
  isStarterTriageEdge,
  isStarterTriageNode,
  TRIAGE_DECISIONS,
  validateAndNormalizeTriageFlow,
  type TriageDecisionKey,
  type TriageFlowEdge,
  type TriageFlowNode,
  type TriageFlowNodeData,
} from "@/lib/triage-flow";

type TriageFlowEditorProps = {
  initialNodes: TriageFlowNode[];
  initialEdges: TriageFlowEdge[];
  initialCompiledRules: Record<string, unknown>;
  saveUrl: string;
  clientId?: string;
  version: number;
  isDefault: boolean;
};

type SaveState =
  | { status: "idle"; message: string }
  | { status: "saving"; message: string }
  | { status: "saved"; message: string }
  | { status: "error"; message: string };

type NodeIconConfig = {
  Icon: LucideIcon;
  shellClass: string;
  iconClass: string;
  portClass: string;
};

const nodeTypes: NodeTypes = {
  triage: TriageNodeCard,
};

const preferredNodeOrder = [
  "channel-whatsapp",
  "channel-telegram",
  "channel-console",
  "decision-complaint-refund",
  "decision-booking-payment",
  "decision-human-handoff",
  "decision-medical-legal",
  "decision-urgent-sentiment",
  "decision-out-of-scope",
  "outcome-answer",
  "outcome-owner-triage",
  "outcome-human-reply",
];

const generatedPositions: Record<string, { x: number; y: number }> = {
  "channel-whatsapp": { x: -620, y: -190 },
  "channel-telegram": { x: -620, y: 20 },
  "channel-console": { x: -620, y: 230 },
  "decision-complaint-refund": { x: -250, y: -250 },
  "decision-booking-payment": { x: -250, y: 0 },
  "decision-human-handoff": { x: -250, y: 250 },
  "decision-medical-legal": { x: 120, y: -250 },
  "decision-urgent-sentiment": { x: 120, y: 0 },
  "decision-out-of-scope": { x: 120, y: 250 },
  "outcome-answer": { x: 500, y: -200 },
  "outcome-owner-triage": { x: 500, y: 45 },
  "outcome-human-reply": { x: 500, y: 290 },
};

export function TriageFlowEditor({
  initialNodes,
  initialEdges,
  initialCompiledRules,
  saveUrl,
  clientId,
  version,
  isDefault,
}: TriageFlowEditorProps) {
  const [nodes, setNodes] = useState<TriageFlowNode[]>(
    () => layoutWorkflowNodes(initialNodes),
  );
  const [edges, setEdges] = useState<TriageFlowEdge[]>(initialEdges);
  const [selectedNodeId, setSelectedNodeId] = useState(
    initialNodes[3]?.id ?? initialNodes[0]?.id,
  );
  const [currentVersion, setCurrentVersion] = useState(version);
  const [compiledRules, setCompiledRules] = useState(initialCompiledRules);
  const [flowInstance, setFlowInstance] =
    useState<ReactFlowInstance<TriageFlowNode, TriageFlowEdge> | null>(null);
  const [saveState, setSaveState] = useState<SaveState>({
    status: "idle",
    message: isDefault ? "Template not published" : `Published v${version}`,
  });

  const selectedNode = nodes.find((node) => node.id === selectedNodeId) ?? nodes[0];
  const validation = useMemo(() => {
    try {
      const normalized = validateAndNormalizeTriageFlow({ nodes, edges });
      return {
        ok: true as const,
        rules: compileTriageFlowToEscalationRules(normalized.nodes),
        error: null,
      };
    } catch (error) {
      return {
        ok: false as const,
        rules: compiledRules,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }, [nodes, edges, compiledRules]);

  const flowStats = useMemo(
    () => ({
      channels: nodes.filter((node) => node.data.kind === "channel").length,
      decisions: nodes.filter((node) => node.data.kind === "decision").length,
      outcomes: nodes.filter((node) => node.data.kind === "outcome").length,
      notes: nodes.filter((node) => node.data.kind === "note").length,
      activeRules: nodes.filter(
        (node) => node.data.kind === "decision" && node.data.enabled !== false,
      ).length,
    }),
    [nodes],
  );

  const onNodesChange = useCallback((changes: NodeChange<TriageFlowNode>[]) => {
    const safeChanges = changes.filter(
      (change) => !(change.type === "remove" && isStarterTriageNode(change.id)),
    );
    setNodes((current) =>
      sortNodesForDiagram(applyNodeChanges(safeChanges, current) as TriageFlowNode[]),
    );
    setSaveState({ status: "idle", message: "Unsaved changes" });
  }, []);

  const onEdgesChange = useCallback((changes: EdgeChange<TriageFlowEdge>[]) => {
    const safeChanges = changes.filter(
      (change) => !(change.type === "remove" && isStarterTriageEdge(change.id)),
    );
    setEdges((current) => applyEdgeChanges(safeChanges, current) as TriageFlowEdge[]);
    setSaveState({ status: "idle", message: "Unsaved changes" });
  }, []);

  const onConnect = useCallback((connection: Connection) => {
    if (!connection.source || !connection.target) {
      return;
    }
    setEdges((current) => {
      const alreadyExists = current.some(
        (edge) => edge.source === connection.source && edge.target === connection.target,
      );
      if (alreadyExists) {
        return current;
      }
      return addEdge(
        {
          ...connection,
          id: `edge-${connection.source}-${connection.target}-${createFlowId()}`,
          type: "smoothstep",
        },
        current,
      ) as TriageFlowEdge[];
    });
    setSaveState({ status: "idle", message: "Unsaved changes" });
  }, []);

  const updateSelectedNode = useCallback(
    (patch: Partial<TriageFlowNode["data"]>) => {
      if (!selectedNode) {
        return;
      }
      setNodes((current) =>
        current.map((node) =>
          node.id === selectedNode.id
            ? { ...node, data: { ...node.data, ...patch } }
            : node,
        ),
      );
      setSaveState({ status: "idle", message: "Unsaved changes" });
    },
    [selectedNode],
  );

  async function saveFlow() {
    setSaveState({ status: "saving", message: "Saving flow" });
    try {
      validateAndNormalizeTriageFlow({ nodes, edges });
      const response = await fetch(saveUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ clientId, nodes, edges }),
      });
      const payload = (await response.json()) as {
        error?: string;
        flow?: {
          version: number;
          compiledEscalationRules: Record<string, unknown>;
        };
      };

      if (!response.ok || !payload.flow) {
        throw new Error(payload.error ?? "Flow could not be saved.");
      }

      setCurrentVersion(payload.flow.version);
      setCompiledRules(payload.flow.compiledEscalationRules);
      setSaveState({ status: "saved", message: `Published v${payload.flow.version}` });
    } catch (error) {
      setSaveState({
        status: "error",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  function resetTemplate() {
    const template = buildDefaultTriageFlow();
    setNodes(sortNodesForDiagram(template.nodes));
    setEdges(template.edges);
    setSelectedNodeId(template.nodes[3]?.id ?? template.nodes[0]?.id);
    setSaveState({ status: "idle", message: "Template restored" });
    fitDiagram();
  }

  function generateDiagram() {
    setNodes((current) => layoutWorkflowNodes(current));
    setSaveState({ status: "idle", message: "Generated layout" });
    fitDiagram();
  }

  function fitDiagram() {
    window.setTimeout(() => {
      flowInstance?.fitView({ padding: 0.18, duration: 320 });
    }, 0);
  }

  function addDecisionNode(decisionKey: TriageDecisionKey) {
    const definition = decisionDefinitionForKey(decisionKey);
    if (!definition) {
      return;
    }
    const duplicateCount = nodes.filter(
      (node) => node.data.kind === "decision" && node.data.decisionKey === decisionKey,
    ).length;
    const node: TriageFlowNode = {
      id: `decision-${decisionKey}-${createFlowId()}`,
      type: "triage",
      position: positionNearSelectedNode(nodes, selectedNodeId),
      data: {
        kind: "decision",
        label: duplicateCount ? `${definition.label} ${duplicateCount + 1}` : definition.label,
        description: definition.description,
        badge: "decision",
        decisionKey: definition.decisionKey,
        reasonCode: definition.reasonCode,
        enabled: true,
        triggerTerms: [...definition.triggerTerms],
      },
    };
    setNodes((current) => sortNodesForDiagram([...current, node]));
    setSelectedNodeId(node.id);
    setSaveState({ status: "idle", message: "Unsaved changes" });
  }

  function addNoteNode() {
    const node: TriageFlowNode = {
      id: `note-${createFlowId()}`,
      type: "triage",
      position: positionNearSelectedNode(nodes, selectedNodeId),
      data: {
        kind: "note",
        label: "Note",
        description: "Internal planning note. Does not change live triage behavior.",
        badge: "note",
      },
    };
    setNodes((current) => sortNodesForDiagram([...current, node]));
    setSelectedNodeId(node.id);
    setSaveState({ status: "idle", message: "Unsaved changes" });
  }

  function deleteSelectedNode() {
    if (!selectedNode || isStarterTriageNode(selectedNode.id)) {
      return;
    }
    setNodes((current) => current.filter((node) => node.id !== selectedNode.id));
    setEdges((current) =>
      current.filter(
        (edge) =>
          edge.source !== selectedNode.id &&
          edge.target !== selectedNode.id &&
          !isStarterTriageEdge(edge.id),
      ),
    );
    setSelectedNodeId(nodes.find((node) => isStarterTriageNode(node.id))?.id ?? "");
    setSaveState({ status: "idle", message: "Unsaved changes" });
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_23rem]">
      <section className="overflow-hidden rounded-lg border border-[#30333d] bg-[#15171d] shadow-sm">
        <div className="flex min-h-14 flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-[#24262b] px-4 py-2.5 text-[#f4f5f8]">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex size-8 items-center justify-center rounded-md border border-white/10 bg-[#17191f] text-[#27c783]">
              <Workflow size={17} />
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-sm font-semibold">Pronto automation flow</h2>
              <p className="text-xs text-white/50">
                {currentVersion ? `Published v${currentVersion}` : "Starter template"}
              </p>
            </div>
          </div>

          <div className="hidden rounded-md border border-white/10 bg-[#30333a] p-1 text-xs font-medium text-white/60 md:flex">
            <span className="rounded bg-[#121318] px-3 py-1.5 text-white">Editor</span>
            <span className="px-3 py-1.5">Executions</span>
            <span className="px-3 py-1.5">Tests</span>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <span className="inline-flex items-center gap-2 text-xs font-medium text-[#27c783]">
              Active
              <span className="relative h-5 w-9 rounded-full bg-[#1fce72]">
                <span className="absolute right-0.5 top-0.5 size-4 rounded-full bg-white" />
              </span>
            </span>
            <StatusPill state={saveState} valid={validation.ok} />
            <button
              className="inline-flex items-center gap-2 rounded-md border border-white/15 bg-[#2d3037] px-3 py-2 text-sm font-medium text-white hover:bg-[#363941]"
              type="button"
              onClick={fitDiagram}
            >
              <SlidersHorizontal size={15} />
              Fit
            </button>
            <button
              className="inline-flex items-center gap-2 rounded-md border border-white/15 bg-[#2d3037] px-3 py-2 text-sm font-medium text-white hover:bg-[#363941]"
              type="button"
              onClick={generateDiagram}
            >
              <Wand2 size={15} />
              Generate diagram
            </button>
            <button
              className="inline-flex items-center gap-2 rounded-md bg-[#ff6d5a] px-3 py-2 text-sm font-semibold text-white hover:bg-[#ff806f] disabled:cursor-not-allowed disabled:opacity-60"
              type="button"
              disabled={!validation.ok || saveState.status === "saving"}
              onClick={saveFlow}
            >
              <Save size={15} />
              Save flow
            </button>
          </div>
        </div>

        <div className="grid min-h-[46rem] bg-[#0f1117] lg:grid-cols-[4.5rem_minmax(0,1fr)]">
          <div className="flex flex-row gap-2 overflow-x-auto border-b border-white/10 bg-[#17191f] p-2 lg:flex-col lg:border-b-0 lg:border-r">
            <PaletteButton
              label="Layout"
              icon={Wand2}
              onClick={generateDiagram}
              tone="green"
            />
            <PaletteSelect onAddDecision={addDecisionNode} />
            <PaletteButton label="Note" icon={FileText} onClick={addNoteNode} />
            <PaletteButton label="Reset" icon={RotateCcw} onClick={resetTemplate} />
          </div>

          <div className="pronto-workflow relative h-[46rem] min-h-[38rem]">
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              onInit={(instance) => setFlowInstance(instance)}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onNodeClick={(_, node) => setSelectedNodeId(node.id)}
              nodesConnectable
              fitView
              fitViewOptions={{ padding: 0.18 }}
              defaultEdgeOptions={{
                type: "smoothstep",
              }}
            >
              <Background gap={18} size={1} color="rgba(255,255,255,0.16)" />
              <MiniMap
                pannable
                zoomable
                nodeColor={(node) => miniMapNodeColor(node.data as TriageFlowNodeData)}
                maskColor="rgba(4, 6, 10, 0.62)"
                style={{
                  background: "#17191f",
                  border: "1px solid rgba(255,255,255,0.12)",
                  borderRadius: 8,
                }}
              />
              <Controls showInteractive={false} />
            </ReactFlow>
          </div>
        </div>
      </section>

      <aside className="space-y-4">
        <section className="overflow-hidden rounded-lg border border-[#30333d] bg-[#17191f] text-[#f4f5f8] shadow-sm">
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold">Node settings</h2>
              <p className="text-xs text-white/45">
                {selectedNode ? selectedNode.data.badge ?? selectedNode.data.kind : "No node"}
              </p>
            </div>
            <Settings2 size={16} className="text-white/45" />
          </div>
          {selectedNode ? (
            <div className="space-y-3 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 text-xs font-medium uppercase text-white/55">
                  {isStarterTriageNode(selectedNode.id) ? "starter node" : "custom node"}
                </span>
                {!isStarterTriageNode(selectedNode.id) ? (
                  <button
                    className="inline-flex items-center gap-2 rounded-md border border-[#52302e] bg-[#2b1717] px-3 py-1.5 text-sm font-medium text-[#ff867d] hover:bg-[#361d1d]"
                    type="button"
                    onClick={deleteSelectedNode}
                  >
                    <Trash2 size={14} />
                    Delete
                  </button>
                ) : null}
              </div>
              <label className="grid gap-1 text-sm">
                <span className="font-medium text-white/80">Label</span>
                <input
                  value={selectedNode.data.label}
                  onChange={(event) => updateSelectedNode({ label: event.target.value })}
                  className="rounded-md border border-white/10 bg-[#101218] px-3 py-2 text-white"
                  maxLength={80}
                />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="font-medium text-white/80">Description</span>
                <textarea
                  value={selectedNode.data.description}
                  onChange={(event) => updateSelectedNode({ description: event.target.value })}
                  className="min-h-20 rounded-md border border-white/10 bg-[#101218] px-3 py-2 text-white"
                  maxLength={240}
                />
              </label>

              {selectedNode.data.kind === "decision" ? (
                <>
                  <label className="flex items-center gap-2 rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-sm font-medium text-white/80">
                    <input
                      type="checkbox"
                      checked={selectedNode.data.enabled !== false}
                      onChange={(event) =>
                        updateSelectedNode({ enabled: event.target.checked })
                      }
                    />
                    Runtime rule enabled
                  </label>
                  <label className="grid gap-1 text-sm">
                    <span className="font-medium text-white/80">Trigger terms</span>
                    <textarea
                      value={(selectedNode.data.triggerTerms ?? []).join("\n")}
                      onChange={(event) =>
                        updateSelectedNode({
                          triggerTerms: event.target.value
                            .split("\n")
                            .map((term) => term.trim())
                            .filter(Boolean),
                        })
                      }
                      className="min-h-36 rounded-md border border-white/10 bg-[#101218] px-3 py-2 font-mono text-xs leading-5 text-white"
                    />
                  </label>
                  <p className="rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-white/55">
                    Reason code: {selectedNode.data.reasonCode}
                  </p>
                </>
              ) : (
                <NodeKindSummary kind={selectedNode.data.kind} />
              )}
            </div>
          ) : (
            <p className="p-4 text-sm text-white/55">Select a node.</p>
          )}
        </section>

        <section className="overflow-hidden rounded-lg border border-[#30333d] bg-[#17191f] text-[#f4f5f8] shadow-sm">
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold">Execution shape</h2>
              <p className="text-xs text-white/45">
                {flowStats.activeRules} active rules across {flowStats.decisions} decisions
              </p>
            </div>
            <GitBranch size={16} className="text-white/45" />
          </div>
          <div className="grid grid-cols-2 gap-2 p-4 text-sm">
            <FlowStat label="Channels" value={flowStats.channels} />
            <FlowStat label="Decisions" value={flowStats.decisions} />
            <FlowStat label="Outcomes" value={flowStats.outcomes} />
            <FlowStat label="Notes" value={flowStats.notes} />
          </div>
        </section>

        <section className="overflow-hidden rounded-lg border border-[#30333d] bg-[#17191f] text-[#f4f5f8] shadow-sm">
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold">Guardrail preview</h2>
              <p className="text-xs text-white/45">Compiled runtime rules</p>
            </div>
            <Braces size={16} className="text-white/45" />
          </div>
          <div className="p-4">
            {validation.ok ? (
              <pre className="max-h-72 overflow-auto rounded-md border border-white/10 bg-[#101218] p-3 text-xs leading-5 text-white/60">
                {JSON.stringify(validation.rules, null, 2)}
              </pre>
            ) : (
              <div className="rounded-md border border-[#6f312c] bg-[#301916] p-3 text-sm text-[#ff867d]">
                {validation.error}
              </div>
            )}
          </div>
        </section>
      </aside>
    </div>
  );
}

function TriageNodeCard({ data, selected }: NodeProps) {
  const nodeData = data as TriageFlowNodeData;
  const isDecision = nodeData.kind === "decision";
  const isOutcome = nodeData.kind === "outcome";
  const disabled = isDecision && nodeData.enabled === false;
  const icon = iconForNode(nodeData);

  return (
    <div
      className={`group relative w-[17rem] rounded-lg border bg-[#2b2d33] p-3 text-left shadow-[0_8px_22px_rgba(0,0,0,0.24)] ${
        disabled ? "border-[#575b67] opacity-70" : icon.shellClass
      } ${selected ? "ring-2 ring-[#6672ff] ring-offset-2 ring-offset-[#0f1117]" : ""}`}
    >
      {nodeData.kind !== "channel" ? (
        <Handle
          type="target"
          position={Position.Left}
          className={`!size-3 !border-2 !border-[#0f1117] ${icon.portClass}`}
        />
      ) : null}

      <div className="flex items-center gap-3">
        <div
          className={`flex size-11 shrink-0 items-center justify-center rounded-md border border-white/10 bg-[#3a3d44] ${icon.iconClass}`}
        >
          <icon.Icon size={23} strokeWidth={2.2} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="line-clamp-2 text-[0.94rem] font-semibold leading-tight text-white">
              {nodeData.label}
            </p>
            <span className="shrink-0 rounded border border-white/10 bg-white/[0.06] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-normal text-white/55">
              {disabled ? "off" : nodeData.badge}
            </span>
          </div>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-white/55">
            {nodeData.description}
          </p>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-white/10 pt-2 text-[11px] text-white/45">
        <span>{runtimeLabel(nodeData)}</span>
        {isDecision ? (
          <span>{(nodeData.triggerTerms ?? []).length} terms</span>
        ) : (
          <span>{nodeData.kind}</span>
        )}
      </div>

      {nodeData.kind !== "outcome" ? (
        <Handle
          type="source"
          position={Position.Right}
          className={`!size-3 !border-2 !border-[#0f1117] ${icon.portClass}`}
        />
      ) : null}

      {!isOutcome ? (
        <div className="pointer-events-none absolute -right-8 top-1/2 hidden -translate-y-1/2 items-center gap-1 text-[10px] font-medium text-white/45 group-hover:flex">
          <span className="flex size-5 items-center justify-center rounded border border-white/15 bg-[#23262d]">
            <Plus size={13} />
          </span>
        </div>
      ) : null}
    </div>
  );
}

function PaletteSelect({
  onAddDecision,
}: {
  onAddDecision: (decisionKey: TriageDecisionKey) => void;
}) {
  return (
    <label className="relative flex min-w-16 cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-white/10 bg-white/[0.04] px-2 py-2 text-[11px] font-medium text-white/70 hover:bg-white/[0.08]">
      <CircleAlert size={18} className="text-[#ffb85c]" />
      Rule
      <select
        aria-label="Add decision rule"
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        defaultValue=""
        onChange={(event) => {
          const value = event.target.value as TriageDecisionKey;
          if (value) {
            onAddDecision(value);
            event.target.value = "";
          }
        }}
      >
        <option value="" disabled>
          Add decision
        </option>
        {TRIAGE_DECISIONS.map((decision) => (
          <option key={decision.decisionKey} value={decision.decisionKey}>
            {decision.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function PaletteButton({
  label,
  icon: Icon,
  onClick,
  tone = "neutral",
}: {
  label: string;
  icon: LucideIcon;
  onClick: () => void;
  tone?: "neutral" | "green";
}) {
  return (
    <button
      className="flex min-w-16 flex-col items-center justify-center gap-1 rounded-md border border-white/10 bg-white/[0.04] px-2 py-2 text-[11px] font-medium text-white/70 hover:bg-white/[0.08]"
      type="button"
      onClick={onClick}
    >
      <Icon size={18} className={tone === "green" ? "text-[#27c783]" : "text-white/65"} />
      {label}
    </button>
  );
}

function NodeKindSummary({ kind }: { kind: TriageFlowNodeData["kind"] }) {
  const copy =
    kind === "note"
      ? "Notes are visible in this editor only and do not affect runtime routing."
      : kind === "channel"
        ? "Channel nodes define where customer messages enter the automation."
        : "Outcome nodes define what Pronto does after decision checks.";

  return (
    <p className="rounded-md border border-white/10 bg-white/[0.04] p-3 text-sm leading-6 text-white/60">
      {copy}
    </p>
  );
}

function FlowStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-white/10 bg-white/[0.04] p-3">
      <p className="text-xs text-white/45">{label}</p>
      <p className="mt-1 text-lg font-semibold text-white">{value}</p>
    </div>
  );
}

function StatusPill({
  state,
  valid,
}: {
  state: SaveState;
  valid: boolean;
}) {
  if (!valid) {
    return (
      <span className="inline-flex items-center gap-1 rounded-md border border-[#6f312c] bg-[#301916] px-2 py-1 text-xs font-medium text-[#ff867d]">
        <AlertTriangle size={13} />
        Invalid flow
      </span>
    );
  }

  const saved = state.status === "saved";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium ${
        saved
          ? "border-[#1d6b45] bg-[#12331f] text-[#55d88f]"
          : "border-white/10 bg-white/[0.04] text-white/60"
      }`}
    >
      {saved ? <CheckCircle2 size={13} /> : null}
      {state.message}
    </span>
  );
}

function iconForNode(nodeData: TriageFlowNodeData): NodeIconConfig {
  if (nodeData.kind === "channel") {
    if (nodeData.label.toLowerCase().includes("whatsapp")) {
      return iconConfig(MessageCircle, "green");
    }
    if (nodeData.label.toLowerCase().includes("telegram")) {
      return iconConfig(Send, "blue");
    }
    return iconConfig(MessageSquare, "purple");
  }

  if (nodeData.kind === "outcome") {
    if (nodeData.badge === "answer") {
      return iconConfig(Database, "green");
    }
    if (nodeData.badge === "handoff") {
      return iconConfig(Headphones, "orange");
    }
    return iconConfig(Bot, "purple");
  }

  if (nodeData.kind === "note") {
    return iconConfig(FileText, "gray");
  }

  switch (nodeData.decisionKey) {
    case "complaint_or_refund":
      return iconConfig(CircleAlert, "red");
    case "transactional_action":
      return iconConfig(CalendarClock, "orange");
    case "human_handoff_requested":
      return iconConfig(UserRoundCheck, "purple");
    case "medical_or_legal":
      return iconConfig(ShieldAlert, "red");
    case "urgent_or_negative_sentiment":
      return iconConfig(Zap, "orange");
    case "out_of_scope":
      return iconConfig(Globe2, "blue");
    default:
      return iconConfig(GitBranch, "blue");
  }
}

function iconConfig(Icon: LucideIcon, tone: "green" | "blue" | "purple" | "orange" | "red" | "gray"): NodeIconConfig {
  const tones = {
    green: {
      shellClass: "border-[#1b8f5a]",
      iconClass: "text-[#41d990]",
      portClass: "!bg-[#41d990]",
    },
    blue: {
      shellClass: "border-[#4f67d8]",
      iconClass: "text-[#8ca2ff]",
      portClass: "!bg-[#8ca2ff]",
    },
    purple: {
      shellClass: "border-[#715fd9]",
      iconClass: "text-[#a997ff]",
      portClass: "!bg-[#a997ff]",
    },
    orange: {
      shellClass: "border-[#a76724]",
      iconClass: "text-[#ffb85c]",
      portClass: "!bg-[#ffb85c]",
    },
    red: {
      shellClass: "border-[#a84a44]",
      iconClass: "text-[#ff867d]",
      portClass: "!bg-[#ff867d]",
    },
    gray: {
      shellClass: "border-[#575b67]",
      iconClass: "text-white/65",
      portClass: "!bg-[#9ca3af]",
    },
  } satisfies Record<string, Omit<NodeIconConfig, "Icon">>;

  return { Icon, ...tones[tone] };
}

function runtimeLabel(nodeData: TriageFlowNodeData): string {
  if (nodeData.kind === "channel") {
    return "trigger";
  }
  if (nodeData.kind === "decision") {
    return nodeData.enabled === false ? "disabled" : "match branch";
  }
  if (nodeData.kind === "outcome") {
    return "action";
  }
  return "annotation";
}

function miniMapNodeColor(nodeData: TriageFlowNodeData): string {
  if (nodeData.kind === "channel") {
    return "#41d990";
  }
  if (nodeData.kind === "decision") {
    return nodeData.enabled === false ? "#6b7280" : "#ffb85c";
  }
  if (nodeData.kind === "outcome") {
    return "#8ca2ff";
  }
  return "#9ca3af";
}

function createFlowId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function positionNearSelectedNode(
  nodes: TriageFlowNode[],
  selectedNodeId: string | undefined,
): { x: number; y: number } {
  const selected = nodes.find((node) => node.id === selectedNodeId);
  if (selected) {
    return {
      x: selected.position.x + 160,
      y: selected.position.y + 140,
    };
  }
  return { x: 0, y: 0 };
}

function layoutWorkflowNodes(nodes: TriageFlowNode[]): TriageFlowNode[] {
  const customDecisionNodes = nodes.filter(
    (node) => node.data.kind === "decision" && !generatedPositions[node.id],
  );
  const noteNodes = nodes.filter((node) => node.data.kind === "note");

  return sortNodesForDiagram(
    nodes.map((node) => {
      const generated = generatedPositions[node.id];
      if (generated) {
        return { ...node, position: generated };
      }

      const customDecisionIndex = customDecisionNodes.findIndex(
        (candidate) => candidate.id === node.id,
      );
      if (customDecisionIndex >= 0) {
        return {
          ...node,
          position: {
            x: 250 + Math.floor(customDecisionIndex / 3) * 390,
            y: -110 + (customDecisionIndex % 3) * 220,
          },
        };
      }

      const noteIndex = noteNodes.findIndex((candidate) => candidate.id === node.id);
      if (noteIndex >= 0) {
        return {
          ...node,
          position: {
            x: -860 + (noteIndex % 3) * 380,
            y: 520 + Math.floor(noteIndex / 3) * 180,
          },
        };
      }

      return node;
    }),
  );
}

function sortNodesForDiagram(nodes: TriageFlowNode[]): TriageFlowNode[] {
  const order = new Map(preferredNodeOrder.map((id, index) => [id, index]));
  return [...nodes].sort((left, right) => {
    const leftOrder = order.get(left.id) ?? 1000;
    const rightOrder = order.get(right.id) ?? 1000;
    if (leftOrder !== rightOrder) {
      return leftOrder - rightOrder;
    }
    return left.id.localeCompare(right.id);
  });
}
