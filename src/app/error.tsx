"use client";

export default function ErrorPage({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <main className="min-h-screen bg-background px-4 py-10 text-foreground">
      <section className="mx-auto max-w-xl ui-panel p-6">
        <p className="text-sm font-medium text-danger">Something failed</p>
        <h1 className="mt-2 text-xl font-semibold">Pronto could not load this view.</h1>
        <p className="mt-2 text-sm text-muted">
          Retry the request. If it keeps failing, share the reference below with support.
        </p>
        <p className="mt-4 rounded-md bg-surface p-3 font-mono text-xs text-muted">
          error_events:{error.digest ?? "unavailable"}
        </p>
        <button type="button" onClick={retry} className="mt-4 ui-primary-button px-4 py-2">
          Retry
        </button>
      </section>
    </main>
  );
}
