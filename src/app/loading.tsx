"use client";

import { useEffect, useState } from "react";

export default function LoadingPage() {
  const [wait, setWait] = useState<"initial" | "slow" | "stalled">("initial");
  useEffect(() => {
    const slow = window.setTimeout(() => setWait("slow"), 10_000);
    const stalled = window.setTimeout(() => setWait("stalled"), 40_000);
    return () => { window.clearTimeout(slow); window.clearTimeout(stalled); };
  }, []);
  return (
    <div className="min-h-screen bg-background text-foreground lg:flex" data-testid="workspace-loading">
      {wait !== "stalled" ? <aside className="hidden h-screen w-[18rem] shrink-0 border-r border-sidebar-line bg-sidebar lg:block" aria-hidden="true">
        <div className="space-y-3 p-4">
          <div className="h-8 w-32 rounded bg-sidebar-active" />
          <div className="h-8 rounded bg-sidebar-active/70" />
          <div className="h-8 rounded bg-sidebar-active/50" />
          <div className="h-8 rounded bg-sidebar-active/40" />
        </div>
      </aside> : null}
      <main className="mx-auto w-full max-w-[1440px] px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
        <section className="mb-5 rounded-md border border-line bg-panel p-4" role="status" aria-live="polite">
          <h1 className="font-semibold">{wait === "stalled" ? "This page has not finished loading." : "Loading your workspace…"}</h1>
          <p className="mt-1 text-sm text-muted">{wait === "initial" ? "Checking your session and loading business data. If this is taking longer than expected, check your connection or reload. Database requests have a timeout."
            : wait === "slow" ? "This is taking longer than expected. The server may still be loading; check your connection or reload the page."
              : "The request may be interrupted or the server unavailable. Reload this page, or sign in again if your session has expired."}</p>
          <div className="mt-2 flex gap-4 text-sm text-accent">
            {/* Plain links also work before a streamed document hydrates. */}
            <a href="/client/inbox">Reload business inbox</a>
            <a href="/login?next=/client/inbox">Check sign-in</a>
          </div>
          <noscript><p className="mt-2 text-sm">Enable JavaScript for navigation and live conversation updates, then reload this page.</p></noscript>
        </section>
        {wait !== "stalled" ? <div aria-hidden="true">
        <div className="mb-5 h-7 w-56 rounded bg-surface" />
        <div className="grid gap-4 md:grid-cols-4">
          <div className="h-24 rounded-lg bg-surface" />
          <div className="h-24 rounded-lg bg-surface" />
          <div className="h-24 rounded-lg bg-surface" />
          <div className="h-24 rounded-lg bg-surface" />
        </div>
        <div className="mt-6 h-96 rounded-lg bg-surface" />
        </div> : null}
      </main>
    </div>
  );
}
