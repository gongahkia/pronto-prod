"use client";

export default function BusinessError({ error, retry }: {
  error: Error & { digest?: string }; retry: () => void;
}) {
  return <main className="min-h-screen bg-background px-4 py-10 text-foreground">
    <section className="ui-panel mx-auto max-w-xl space-y-4 p-6" role="alert">
      <h1 className="text-xl font-semibold">The business workspace could not load.</h1>
      <p className="text-sm text-muted">The server or database request failed. Check your connection and retry. If your session has expired, sign in again.</p>
      <p className="font-mono text-xs text-muted">Reference: {error.digest ?? "unavailable"}</p>
      <div className="flex flex-wrap gap-4 text-sm">
        <button className="ui-primary-button px-4 py-2" onClick={retry}>Retry loading</button>
        <a className="ui-button px-4 py-2" href="/client/inbox">Reload business inbox</a>
        <a className="px-4 py-2 text-accent" href="/login?next=/client/inbox">Check sign-in</a>
      </div>
    </section>
  </main>;
}
