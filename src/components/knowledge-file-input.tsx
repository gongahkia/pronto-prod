"use client";

import { useId, useState } from "react";

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const ACCEPTED_KNOWLEDGE_TYPES =
  ".pdf,.docx,.html,.htm,.txt,.md,.markdown,.csv,text/html,text/plain,text/markdown,text/csv,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export function KnowledgeFileInput({ required = false, pdfOnly = false }: { required?: boolean; pdfOnly?: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const id = useId();

  return (
    <label className="block text-sm">
      <span className="sr-only">Knowledge file</span>
      <input
        name="file"
        aria-label="Knowledge file"
        type="file"
        required={required}
        accept={pdfOnly ? ".pdf,application/pdf" : ACCEPTED_KNOWLEDGE_TYPES}
        className="w-full rounded-md border border-line px-3 py-2 text-sm"
        aria-describedby={`${id}-help${error ? ` ${id}-error` : ""}`}
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
      <p id={`${id}-help`} className="mt-1 text-xs text-muted">
        {pdfOnly ? "PDF · up to 8 MB." : "PDF, Word (.docx), HTML, TXT, Markdown or CSV · up to 8 MB."}
      </p>
      {error ? (
        <p id={`${id}-error`} className="mt-1 text-xs text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </label>
  );
}
