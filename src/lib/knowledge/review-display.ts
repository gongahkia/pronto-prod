export type ConflictStatement = { statement: string; sourceUrl: string | null };

export function conflictStatements(value: unknown): ConflictStatement[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap(item => {
    if (!item || typeof item !== "object") return [];
    const claim = item as Record<string, unknown>;
    const statement = typeof claim.claim === "string" ? claim.claim : typeof claim.statement === "string" ? claim.statement
      : typeof claim.cutoff === "string" ? `Cutoff: ${claim.cutoff}` : null;
    return statement?.trim() ? [{ statement: statement.trim(), sourceUrl: typeof claim.sourceUrl === "string" ? safeSourceUrl(claim.sourceUrl) : null }] : [];
  });
}

export function safeSourceUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try { const url = new URL(value); return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password ? url.href : null; }
  catch { return null; }
}

export function reviewStatusLabel(status: string): string {
  const labels: Record<string, string> = { pending: "Pending review", approved: "Approved · awaiting publication", staged: "Draft prepared",
    revision_requested: "Changes requested", rejected: "Rejected", validation_failed: "Import failed", published: "Published", open: "Needs an answer", suggested: "Correction proposed" };
  return labels[status] ?? status.replace(/_/g, " ");
}

export type DiffLine = { kind: "same" | "removed" | "added"; text: string; before: number | null; after: number | null };

export function knowledgeLineDiff(before: string, after: string): DiffLine[] {
  const a = before ? before.replace(/\r\n?/g, "\n").split("\n") : [];
  const b = after ? after.replace(/\r\n?/g, "\n").split("\n") : [];
  const lines: DiffLine[] = [];
  let i = 0, j = 0;
  const same = () => { lines.push({ kind: "same", text: a[i], before: ++i, after: ++j }); };
  const removed = () => { lines.push({ kind: "removed", text: a[i], before: ++i, after: null }); };
  const added = () => { lines.push({ kind: "added", text: b[j], before: null, after: ++j }); };
  while (i < a.length && j < b.length && a[i] === b[j]) same();
  let aEnd = a.length, bEnd = b.length;
  while (aEnd > i && bEnd > j && a[aEnd - 1] === b[bEnd - 1]) { aEnd--; bEnd--; }
  const height = aEnd - i, width = bEnd - j;
  // Bound comparison work for long uploads. The fallback still shows the exact changed text.
  if (height > 0 && width > 0 && height * width <= 250_000) {
    const matrix = Array.from({ length: height + 1 }, () => new Uint32Array(width + 1));
    const startI = i, startJ = j;
    for (let row = height - 1; row >= 0; row--) for (let col = width - 1; col >= 0; col--)
      matrix[row][col] = a[startI + row] === b[startJ + col] ? matrix[row + 1][col + 1] + 1 : Math.max(matrix[row + 1][col], matrix[row][col + 1]);
    while (i < aEnd && j < bEnd) {
      if (a[i] === b[j]) same();
      else if (matrix[i - startI + 1][j - startJ] >= matrix[i - startI][j - startJ + 1]) removed();
      else added();
    }
  }
  while (i < aEnd) removed();
  while (j < bEnd) added();
  while (i < a.length && j < b.length) same();
  return lines;
}
