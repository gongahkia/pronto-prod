export type KnowledgeSourceDiagnostic = {
  label: string;
  value: string;
};

export type NormalizedKnowledgeSourceMetadata = {
  warnings: string[];
  diagnostics: KnowledgeSourceDiagnostic[];
};

export function normalizeKnowledgeSourceMetadata(
  metadata: Record<string, unknown> | null | undefined,
): NormalizedKnowledgeSourceMetadata {
  const source = metadata ?? {};
  const warnings = stringArray(source.warnings);
  const diagnostics: KnowledgeSourceDiagnostic[] = [];

  addDiagnostic(diagnostics, "Entry mode", stringValue(source.entryMode));
  addDiagnostic(diagnostics, "Filename", stringValue(source.filename));
  addDiagnostic(diagnostics, "MIME type", stringValue(source.mimeType));
  addDiagnostic(diagnostics, "Parser", stringValue(source.parser));
  addDiagnostic(diagnostics, "Rows", numberValue(source.rows));
  addDiagnostic(diagnostics, "Pages", numberValue(source.pages));
  addDiagnostic(diagnostics, "Size", byteSizeValue(source.sizeBytes));

  return { warnings, diagnostics };
}

function addDiagnostic(
  diagnostics: KnowledgeSourceDiagnostic[],
  label: string,
  value: string | null,
): void {
  if (value) {
    diagnostics.push({ label, value });
  }
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberValue(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? String(parsed) : null;
  }
  return null;
}

function byteSizeValue(value: unknown): string | null {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return null;
  }
  if (numeric < 1024) {
    return `${numeric} B`;
  }
  if (numeric < 1024 * 1024) {
    return `${(numeric / 1024).toFixed(1)} KB`;
  }
  return `${(numeric / 1024 / 1024).toFixed(1)} MB`;
}
