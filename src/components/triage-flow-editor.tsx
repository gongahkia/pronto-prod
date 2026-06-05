"use client";

import {
  AlertTriangle,
  CheckCircle2,
  RotateCcw,
  Save,
} from "lucide-react";
import {
  Background,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  applyEdgeChanges,
  applyNodeChanges,
  type EdgeChange,
  type NodeChange,
  type NodeProps,
  type NodeTypes,
} from "@xyflow/react";
import { useCallback, useMemo, useState } from "react";
import {
  buildDefaultTriageFlow,
  compileTriageFlowToEscalationRules,
  validateAndNormalizeTriageFlow,
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

const nodeTypes: NodeTypes = {
  triage: TriageNodeCard,
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
  const [nodes, setNodes] = useState<TriageFlowNode[]>(initialNodes);
  const [edges, setEdges] = useState<TriageFlowEdge[]>(initialEdges);
  const [selectedNodeId, setSelectedNodeId] = useState(initialNodes[3]?.id ?? initialNodes[0]?.id);
  const [currentVersion, setCurrentVersion] = useState(version);
  const [compiledRules, setCompiledRules] = useState(initialCompiledRules);
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

  const onNodesChange = useCallback((changes: NodeChange<TriageFlowNode>[]) => {
    setNodes((current) => applyNodeChanges(changes, current) as TriageFlowNode[]);
    setSaveState({ status: "idle", message: "Unsaved changes" });
  }, []);

  const onEdgesChange = useCallback((changes: EdgeChange<TriageFlowEdge>[]) => {
    setEdges((current) => applyEdgeChanges(changes, current) as TriageFlowEdge[]);
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
    setNodes(template.nodes);
    setEdges(template.edges);
    setSelectedNodeId(template.nodes[3]?.id ?? template.nodes[0]?.id);
    setSaveState({ status: "idle", message: "Template restored" });
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <section className="ui-panel overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
          <div>
            <h2 className="text-base font-semibold">Customer triage flow</h2>
            <p className="text-xs text-muted">
              {currentVersion ? `Published version ${currentVersion}` : "Starter template"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill state={saveState} valid={validation.ok} />
            <button className="ui-button gap-2 px-3 py-2" type="button" onClick={resetTemplate}>
              <RotateCcw size={15} />
              Reset
            </button>
            <button
              className="ui-primary-button gap-2 px-3 py-2 disabled:cursor-not-allowed disabled:opacity-60"
              type="button"
              disabled={!validation.ok || saveState.status === "saving"}
              onClick={saveFlow}
            >
              <Save size={15} />
              Save flow
            </button>
          </div>
        </div>
        <div className="h-[42rem] min-h-[34rem] bg-surface">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={(_, node) => setSelectedNodeId(node.id)}
            nodesConnectable={false}
            fitView
            fitViewOptions={{ padding: 0.2 }}
          >
            <Background gap={22} size={1} />
            <MiniMap pannable zoomable />
            <Controls showInteractive={false} />
          </ReactFlow>
        </div>
      </section>

      <aside className="space-y-4">
        <section className="ui-panel">
          <div className="ui-panel-header">
            <h2 className="text-base font-semibold">Node settings</h2>
          </div>
          {selectedNode ? (
            <div className="space-y-3 p-4">
              <label className="grid gap-1 text-sm">
                <span className="font-medium">Label</span>
                <input
                  value={selectedNode.data.label}
                  onChange={(event) => updateSelectedNode({ label: event.target.value })}
                  className="rounded-md border border-line px-3 py-2"
                  maxLength={80}
                />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="font-medium">Description</span>
                <textarea
                  value={selectedNode.data.description}
                  onChange={(event) => updateSelectedNode({ description: event.target.value })}
                  className="min-h-20 rounded-md border border-line px-3 py-2"
                  maxLength={240}
                />
              </label>

              {selectedNode.data.kind === "decision" ? (
                <>
                  <label className="flex items-center gap-2 text-sm font-medium">
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
                    <span className="font-medium">Trigger terms</span>
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
                      className="min-h-36 rounded-md border border-line px-3 py-2 font-mono text-xs"
                    />
                  </label>
                  <p className="text-xs text-muted">
                    Reason code: {selectedNode.data.reasonCode}
                  </p>
                </>
              ) : (
                <p className="rounded-md border border-line bg-surface p-3 text-sm text-muted">
                  {selectedNode.data.kind === "channel"
                    ? "Channel nodes define where customer messages enter the flow."
                    : "Outcome nodes define what Pronto does after decision checks."}
                </p>
              )}
            </div>
          ) : (
            <p className="p-4 text-sm text-muted">Select a node.</p>
          )}
        </section>

        <section className="ui-panel">
          <div className="ui-panel-header">
            <h2 className="text-base font-semibold">Guardrail preview</h2>
          </div>
          <div className="p-4">
            {validation.ok ? (
              <pre className="max-h-72 overflow-auto rounded-md border border-line bg-surface p-3 text-xs leading-5 text-muted">
                {JSON.stringify(validation.rules, null, 2)}
              </pre>
            ) : (
              <div className="rounded-md border border-danger/30 bg-danger-bg p-3 text-sm text-danger">
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
  const tone = isOutcome
    ? "border-success/30 bg-success-bg"
    : isDecision
      ? disabled
        ? "border-line-strong bg-surface"
        : "border-accent/40 bg-panel"
      : "border-line-strong bg-panel";

  return (
    <div
      className={`w-60 rounded-md border p-3 text-left shadow-sm ${tone} ${
        selected ? "ring-2 ring-accent" : ""
      }`}
    >
      {nodeData.kind !== "channel" ? (
        <Handle type="target" position={Position.Left} className="!bg-line-strong" />
      ) : null}
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold">{nodeData.label}</p>
          <p className="mt-1 line-clamp-2 text-xs text-muted">{nodeData.description}</p>
        </div>
        <span className="rounded border border-line bg-surface px-1.5 py-0.5 text-[10px] font-medium uppercase text-muted">
          {disabled ? "off" : nodeData.badge}
        </span>
      </div>
      {isDecision ? (
        <p className="mt-2 text-[11px] text-muted">
          {(nodeData.triggerTerms ?? []).length} terms
        </p>
      ) : null}
      {nodeData.kind !== "outcome" ? (
        <Handle type="source" position={Position.Right} className="!bg-accent" />
      ) : null}
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
      <span className="inline-flex items-center gap-1 rounded-md border border-danger/30 bg-danger-bg px-2 py-1 text-xs font-medium text-danger">
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
          ? "border-success/30 bg-success-bg text-success"
          : "border-line bg-surface text-muted"
      }`}
    >
      {saved ? <CheckCircle2 size={13} /> : null}
      {state.message}
    </span>
  );
}
