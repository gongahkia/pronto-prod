"use client";

import { useState } from "react";

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const ACCEPTED_KNOWLEDGE_TYPES =
  ".pdf,.docx,.txt,.md,.markdown,.csv,text/plain,text/markdown,text/csv,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export function KnowledgeFileInput() {
  const [error, setError] = useState<string | null>(null);

  return (
    <label className="block text-sm">
      <span className="sr-only">Knowledge file</span>
      <input
        name="file"
        type="file"
        accept={ACCEPTED_KNOWLEDGE_TYPES}
        className="w-full rounded-md border border-line px-3 py-2 text-sm"
        aria-describedby="knowledge-file-help knowledge-file-error"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          if (file && file.size > MAX_UPLOAD_BYTES) {
            const message = "Choose a file up to 8 MB.";
            event.currentTarget.setCustomValidity(message);
            setError(message);
            return;
          }
          event.currentTarget.setCustomValidity("");
          setError(null);
        }}
      />
      <p id="knowledge-file-help" className="mt-1 text-xs text-muted">
        Supports PDF, DOCX, TXT, Markdown, and CSV up to 8 MB.
      </p>
      {error ? (
        <p id="knowledge-file-error" className="mt-1 text-xs text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </label>
  );
}
