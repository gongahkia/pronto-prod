"use client";

import dynamic from "next/dynamic";

export const TriageFlowEditorLoader = dynamic(
  () => import("@/components/triage-flow-editor").then((mod) => mod.TriageFlowEditor),
  {
    ssr: false,
    loading: () => (
      <div className="rounded-lg border border-line bg-surface p-4 text-sm text-muted">
        Loading flow editor...
      </div>
    ),
  },
);
