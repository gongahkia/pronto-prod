"use client";

import { useState, useTransition } from "react";

type Props = {
  initialValue: string;
  saveAction: (value: string) => Promise<void>;
  readOnly?: boolean;
};

export function TriageFlowJsonEditor({ initialValue, saveAction, readOnly }: Props) {
  const [value, setValue] = useState(initialValue);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function onSave() {
    try {
      JSON.parse(value);
    } catch {
      setError("Invalid JSON");
      return;
    }
    setError(null);
    startTransition(async () => {
      await saveAction(value);
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <textarea
        className="ui-input min-h-[400px] font-mono text-sm"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        readOnly={readOnly}
      />
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {!readOnly ? (
        <button className="ui-primary-button self-start" onClick={onSave} disabled={pending}>
          {pending ? "Saving..." : "Save"}
        </button>
      ) : null}
    </div>
  );
}
