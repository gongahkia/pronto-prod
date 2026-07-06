"use client";

import { useEffect, useId, useMemo, useRef, useState, useTransition } from "react";

type Props = {
  initialValue: string;
  saveAction: (value: string) => Promise<void>;
  readOnly?: boolean;
};

type MermaidNode = {
  id: string;
  kind: string;
  label: string;
  description: string;
  enabled: boolean;
};

type MermaidEdge = {
  source: string;
  target: string;
  label: string;
  animated: boolean;
};

type MermaidFlow = {
  nodes: MermaidNode[];
  edges: MermaidEdge[];
};

type ParsedFlow =
  | {
      error: null;
      mermaid: string;
    }
  | {
      error: string;
      mermaid: "";
    };

export function TriageFlowJsonEditor({ initialValue, saveAction, readOnly }: Props) {
  const [value, setValue] = useState(initialValue);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [svg, setSvg] = useState<string | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);
  const reactId = useId();
  const renderId = useMemo(
    () => `triage-flow-${reactId.replace(/[^a-zA-Z0-9_-]/g, "")}`,
    [reactId],
  );
  const renderCount = useRef(0);
  const parsed = useMemo(() => parseFlow(value), [value]);

  useEffect(() => {
    if (parsed.error) {
      return;
    }

    let active = true;
    const id = `${renderId}-${renderCount.current}`;
    renderCount.current += 1;

    async function renderDiagram() {
      try {
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          theme: "base",
          themeVariables: {
            background: "transparent",
            primaryColor: "#eef2ff",
            primaryTextColor: "#000000",
            primaryBorderColor: "#455dd3",
            lineColor: "#6b7280",
            secondaryColor: "#eefaf3",
            tertiaryColor: "#fff8e6",
          },
        });
        const result = await mermaid.render(id, parsed.mermaid);
        if (active) {
          setSvg(result.svg);
          setRenderError(null);
        }
      } catch (renderFailure) {
        if (active) {
          setSvg(null);
          setRenderError(
            renderFailure instanceof Error ? renderFailure.message : "Unable to render diagram.",
          );
        }
      }
    }

    void renderDiagram();
    return () => {
      active = false;
    };
  }, [parsed, renderId]);

  async function onSave() {
    if (parsed.error) {
      setError(parsed.error);
      return;
    }
    setError(null);
    startTransition(async () => {
      await saveAction(value);
    });
  }

  return (
    <div className="space-y-4">
      <section className="rounded-md border border-line">
        <div className="border-b border-line px-4 py-3">
          <h3 className="text-sm font-semibold">Diagram</h3>
        </div>
        <div className="overflow-auto bg-surface p-4">
          {parsed.error ? (
            <p className="text-sm text-danger">{parsed.error}</p>
          ) : renderError ? (
            <p className="text-sm text-danger">{renderError}</p>
          ) : svg ? (
            <div
              className="min-w-[42rem] [&_svg]:h-auto [&_svg]:max-w-none"
              dangerouslySetInnerHTML={{ __html: svg }}
            />
          ) : (
            <p className="text-sm text-muted">Rendering diagram...</p>
          )}
        </div>
        {!parsed.error ? (
          <details className="border-t border-line px-4 py-3">
            <summary className="cursor-pointer text-sm font-medium text-link">
              Mermaid source
            </summary>
            <pre className="mt-3 max-h-72 overflow-auto rounded-md bg-surface p-3 text-xs leading-5 text-muted">
              {parsed.mermaid}
            </pre>
          </details>
        ) : null}
      </section>
      <section className="rounded-md border border-line">
        <div className="border-b border-line px-4 py-3">
          <h3 className="text-sm font-semibold">JSON</h3>
        </div>
        <textarea
          className="ui-input min-h-[400px] w-full rounded-none border-0 p-4 font-mono text-sm"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          readOnly={readOnly}
        />
      </section>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {!readOnly ? (
        <button className="ui-primary-button self-start" onClick={onSave} disabled={pending}>
          {pending ? "Saving..." : "Save"}
        </button>
      ) : null}
    </div>
  );
}

function parseFlow(value: string): ParsedFlow {
  let input: unknown;
  try {
    input = JSON.parse(value);
  } catch {
    return { error: "Invalid JSON", mermaid: "" };
  }

  if (!isRecord(input) || !Array.isArray(input.nodes) || !Array.isArray(input.edges)) {
    return { error: "Flow JSON must include nodes and edges arrays.", mermaid: "" };
  }

  const nodes = input.nodes.map(readNode);
  const edges = input.edges.map(readEdge);
  if (nodes.some((node) => !node) || edges.some((edge) => !edge)) {
    return { error: "Flow JSON has an invalid node or edge.", mermaid: "" };
  }

  return {
    error: null,
    mermaid: toMermaid({
      nodes: nodes as MermaidNode[],
      edges: edges as MermaidEdge[],
    }),
  };
}

function readNode(input: unknown): MermaidNode | null {
  if (!isRecord(input) || typeof input.id !== "string" || !isRecord(input.data)) {
    return null;
  }
  const data = input.data;
  return {
    id: input.id,
    kind: typeof data.kind === "string" ? data.kind : "note",
    label: typeof data.label === "string" ? data.label : input.id,
    description: typeof data.description === "string" ? data.description : "",
    enabled: data.enabled !== false,
  };
}

function readEdge(input: unknown): MermaidEdge | null {
  if (!isRecord(input) || typeof input.source !== "string" || typeof input.target !== "string") {
    return null;
  }
  return {
    source: input.source,
    target: input.target,
    label: typeof input.label === "string" ? input.label : "",
    animated: input.animated === true,
  };
}

function toMermaid(flow: MermaidFlow): string {
  const ids = new Map(flow.nodes.map((node, index) => [node.id, `n${index}`]));
  const lines = ["flowchart LR"];

  for (const node of flow.nodes) {
    const id = ids.get(node.id);
    if (!id) continue;
    lines.push(`  ${id}${nodeShape(node)}`);
  }

  for (const edge of flow.edges) {
    const source = ids.get(edge.source);
    const target = ids.get(edge.target);
    if (!source || !target) continue;
    const arrow = edge.animated ? "==>" : "-->";
    const label = edge.label ? `|${escapeEdgeLabel(edge.label)}|` : "";
    lines.push(`  ${source} ${arrow}${label} ${target}`);
  }

  lines.push(
    "  classDef channel fill:#eef2ff,stroke:#455dd3,color:#000000",
    "  classDef decision fill:#fff8e6,stroke:#a15c07,color:#000000",
    "  classDef outcome fill:#eefaf3,stroke:#087443,color:#000000",
    "  classDef note fill:#f5f7fb,stroke:#6b7280,color:#000000",
    "  classDef disabled fill:#f5f7fb,stroke:#d92d20,color:#6b7280,stroke-dasharray: 5 5",
  );

  for (const node of flow.nodes) {
    const id = ids.get(node.id);
    if (!id) continue;
    lines.push(`  class ${id} ${node.enabled ? className(node.kind) : "disabled"}`);
  }

  return lines.join("\n");
}

function nodeShape(node: MermaidNode): string {
  const label = quoteMermaidLabel(
    [node.label, node.description].filter(Boolean).join("<br/>"),
  );
  if (node.kind === "decision") return `{${label}}`;
  if (node.kind === "outcome") return `([${label}])`;
  if (node.kind === "channel") return `[${label}]`;
  return `[${label}]`;
}

function className(kind: string): string {
  if (kind === "channel" || kind === "decision" || kind === "outcome") {
    return kind;
  }
  return "note";
}

function quoteMermaidLabel(value: string): string {
  return `"${value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, "#quot;")
    .replace(/\[/g, "&#91;")
    .replace(/\]/g, "&#93;")
    .slice(0, 320)}"`;
}

function escapeEdgeLabel(value: string): string {
  return value
    .replace(/\|/g, "#124;")
    .replace(/"/g, "#quot;")
    .slice(0, 48);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
