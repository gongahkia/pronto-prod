import Link from "next/link";

export default function NotFoundPage() {
  return (
    <main className="min-h-screen bg-background px-4 py-10 text-foreground">
      <section className="mx-auto max-w-xl ui-panel p-6">
        <p className="text-sm font-medium text-warning">Not found</p>
        <h1 className="mt-2 text-xl font-semibold">This Pronto view is unavailable.</h1>
        <p className="mt-2 text-sm text-muted">
          The record may have been removed, or your session may not have access.
        </p>
        <Link href="/" className="mt-4 ui-button px-4 py-2">
          Go home
        </Link>
      </section>
    </main>
  );
}
