"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent, type ReactNode } from "react";

export function KnowledgeForm({ action, children, submitLabel, className = "grid gap-4" }: {
  action: string; children: ReactNode; submitLabel?: string; className?: string;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const form = event.currentTarget;
    const body = new FormData(form);
    const button = (event.nativeEvent as SubmitEvent).submitter;
    if (button instanceof HTMLButtonElement && button.name) body.set(button.name, button.value);
    setSaving(true); setError("");
    try {
      const response = await fetch(action, { method: "POST", body });
      if (!response.ok) {
        const result = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(result?.error ?? "Could not save this change. Please try again.");
      }
      form.closest("dialog")?.close();
      if (response.redirected) {
        const destination = new URL(response.url);
        router.push(destination.pathname + destination.search + destination.hash);
      }
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save this change.");
    } finally { setSaving(false); }
  }
  return <form action={action} method="post" encType="multipart/form-data" onSubmit={submit}
    onChange={() => { if (error) setError(""); }} className={className}>
    <fieldset disabled={saving} className="contents">{children}
      {submitLabel && <button className="ui-primary-button w-fit px-4 py-2 text-sm">{saving ? "Saving…" : submitLabel}</button>}
    </fieldset>
    {saving && !submitLabel && <p role="status" className="text-sm text-muted">Saving…</p>}
    {error && <p role="alert" className="rounded-md bg-danger-bg p-3 text-sm text-danger">{error}</p>}
  </form>;
}
