import { normalizeKnowledgeSourceMetadata } from "@/lib/knowledge/metadata";
import type { KnowledgeSourceVersion } from "@/lib/knowledge/manage";
import { Badge } from "@/components/badge";

export function KnowledgeSourceDiagnostics({
  metadata,
}: {
  metadata: Record<string, unknown>;
}) {
  const { warnings, diagnostics } = normalizeKnowledgeSourceMetadata(metadata);

  if (!warnings.length && !diagnostics.length) {
    return null;
  }

  return (
    <div className="border-t border-line p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold">Source diagnostics</h3>
        {warnings.length ? <Badge tone="amber">{warnings.length} warnings</Badge> : <Badge tone="green">clear</Badge>}
      </div>
      {warnings.length ? (
        <div className="mb-3 space-y-2">
          {warnings.map((warning) => (
            <p key={warning} className="rounded-md bg-warning-bg px-3 py-2 text-sm text-warning">
              {warning}
            </p>
          ))}
        </div>
      ) : null}
      {diagnostics.length ? (
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          {diagnostics.map((item) => (
            <div key={`${item.label}:${item.value}`}>
              <dt className="text-xs font-medium text-muted">
                {item.label}
              </dt>
              <dd className="mt-1 break-words font-medium">{item.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </div>
  );
}

export function KnowledgeSourceVersionHistory({
  currentVersion,
  versions,
}: {
  currentVersion: number | null;
  versions: KnowledgeSourceVersion[];
}) {
  return (
    <div className="border-t border-line p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold">Version history</h3>
        {currentVersion ? <Badge>v{currentVersion}</Badge> : <Badge tone="amber">pending backfill</Badge>}
      </div>
      {versions.length ? (
        <div className="divide-y divide-line rounded-md border border-line">
          {versions.map((version) => (
            <div key={version.id} className="flex flex-wrap items-center justify-between gap-3 p-3 text-sm">
              <div>
                <p className="font-medium">
                  v{version.version_number} · {version.change_type}
                </p>
                <p className="text-muted">{version.title}</p>
              </div>
              <time className="text-muted" dateTime={version.created_at.toISOString()}>
                {version.created_at.toLocaleString("en-SG", {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </time>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted">No version rows yet. The migration backfills existing sources.</p>
      )}
    </div>
  );
}
