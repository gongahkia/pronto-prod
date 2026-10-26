import { AlertTriangle, ExternalLink, GitCompareArrows } from "lucide-react";
import { conflictStatements, knowledgeLineDiff } from "@/lib/knowledge/review-display";

export function KnowledgeDiff({ before, after, beforeLabel = "Current version", afterLabel = "Proposed version", conflict = false }: {
  before: string; after: string; beforeLabel?: string; afterLabel?: string; conflict?: boolean;
}) {
  const lines = knowledgeLineDiff(before, after);
  return <div className="min-w-0 overflow-hidden rounded-lg border border-line" aria-label={conflict ? "Conflicting statements comparison" : "Proposed changes comparison"}>
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-line bg-surface px-4 py-3 text-xs">
      <GitCompareArrows size={16} className="text-muted" aria-hidden="true"/>
      <span className={conflict ? "text-foreground" : "text-danger"}>− {beforeLabel}</span>
      <span className={conflict ? "text-warning" : "text-success"}>+ {afterLabel}</span>
    </div>
    <div className="max-h-[32rem] overflow-y-auto text-xs leading-6">
      {lines.length ? lines.map((line, index) => <div key={index} className={`flex min-w-0 ${line.kind === "same" ? "" : conflict
        ? line.kind === "added" ? "bg-warning-bg" : "bg-surface" : line.kind === "added" ? "bg-success-bg" : "bg-danger-bg"}`}>
        <span aria-hidden="true" className="w-9 shrink-0 select-none border-r border-line px-2 text-right font-mono text-muted">{line.before}</span>
        <span aria-hidden="true" className="w-9 shrink-0 select-none border-r border-line px-2 text-right font-mono text-muted">{line.after}</span>
        <span className={`w-7 shrink-0 text-center font-mono ${conflict ? "text-muted" : line.kind === "added" ? "text-success" : "text-danger"}`} aria-label={line.kind === "same" ? undefined : line.kind}>
          {line.kind === "same" ? " " : line.kind === "added" ? "+" : "−"}</span>
        <span className="min-w-0 flex-1 whitespace-pre-wrap break-words py-0.5 pr-4 font-mono [overflow-wrap:anywhere]">{line.text || " "}</span>
      </div>) : <p className="p-4 text-muted">No content to compare.</p>}
    </div>
  </div>;
}

export function KnowledgeConflictReview({ metadata }: { metadata: Record<string, unknown> }) {
  const claims = conflictStatements(metadata.conflictingClaims);
  if (!String(metadata.reviewStatus ?? "").includes("conflict")) return null;
  const reason = [metadata.conflictReason, metadata.reviewReason, metadata.reviewNote].find(value => typeof value === "string" && value.trim());
  return <section className="ui-panel overflow-hidden" aria-labelledby="conflict-heading">
    <div className="border-b border-line bg-warning-bg p-5">
      <h2 id="conflict-heading" className="flex items-center gap-2 font-semibold"><AlertTriangle size={19} className="text-warning" aria-hidden="true"/>What needs review</h2>
      <p className="mt-2 text-sm text-muted">These source statements disagree. This document is withheld from customer answers until a correction is reviewed and published.</p>
      {typeof reason === "string" && <p className="mt-2 text-sm">{reason}</p>}
    </div>
    <div className="space-y-4 p-5">
      {claims.length ? <>
        <div className="grid gap-4 sm:grid-cols-2">{claims.map((claim, index) => <div key={index} className="min-w-0">
          <p className="text-xs font-medium text-muted">Statement {index + 1} · unverified</p>
          <p className="mt-2 text-sm font-medium">{claim.statement}</p>
          {claim.sourceUrl && <a href={claim.sourceUrl} target="_blank" rel="noreferrer" title={claim.sourceUrl} className="mt-2 inline-flex max-w-full items-start gap-1.5 break-all text-xs text-accent">
            <ExternalLink size={13} className="mt-0.5 shrink-0" aria-hidden="true"/>{claim.sourceUrl}</a>}
        </div>)}</div>
        {claims.length > 1 && <KnowledgeDiff before={claims[0].statement} after={claims.slice(1).map(claim => claim.statement).join("\n")}
          beforeLabel="Statement 1 · unverified" afterLabel={claims.length === 2 ? "Statement 2 · unverified" : "Other statements · unverified"} conflict/>}
        <p className="text-xs text-muted">The comparison shows the disagreement. Neither version has been confirmed. Use “Suggest a correction” with supporting evidence.</p>
      </> : <p className="text-sm text-muted">An information conflict was recorded without statement details. Review the source content and supporting references, then suggest a correction.</p>}
    </div>
  </section>;
}
