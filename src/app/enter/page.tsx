import { BotMessageSquare } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { safeReturnTo, signedInDestination } from "@/lib/auth-navigation";
import { guestAccessEnabled, guestSimulatorEnabled } from "@/lib/guest-policy";

export default async function EnterDemoPage({ searchParams }: { searchParams: Promise<{ error?: string; next?: string }> }) {
  if (!guestAccessEnabled()) notFound();
  const params = await searchParams;
  const returnTo = safeReturnTo(params.next);
  const user = await getSessionUser();
  if (user) redirect(signedInDestination(user.role, returnTo));
  return (
    <main className="flex min-h-screen items-center justify-center bg-surface-subtle px-4 py-10 text-foreground">
      <section className="ui-panel w-full max-w-md p-6 sm:p-8" aria-labelledby="enter-heading">
        <div className="mb-6 flex items-center gap-3 text-lg font-semibold">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-white"><BotMessageSquare size={22} aria-hidden="true" /></span>
          Pronto prototype
        </div>
        <h1 id="enter-heading" className="text-xl font-semibold">Review the demo</h1>
        <p className="mb-6 mt-1 text-sm leading-6 text-muted">
          Look around the PS Cafe prototype and leave comments for the team. This is a read-only preview of synthetic data
          {guestSimulatorEnabled() ? "; you can also try the customer chat" : ""}. Nothing you do here is sent to real customers.
        </p>
        {params.error ? <p role="alert" className="mb-4 rounded-md border border-danger/25 bg-danger-bg px-3 py-2 text-sm text-danger">{params.error}</p> : null}
        <form action="/api/auth/guest" method="post" className="space-y-4">
          {returnTo ? <input type="hidden" name="next" value={returnTo} /> : null}
          <label className="block text-sm font-medium">
            Your name
            <input name="name" required maxLength={40} autoComplete="name" placeholder="e.g. Keith"
              className="mt-1 w-full rounded-md border border-line px-3 py-2 outline-none focus:border-accent" />
          </label>
          <button type="submit" className="ui-primary-button w-full px-3 py-2 text-sm">Enter the demo</button>
        </form>
        <p className="mt-5 text-xs leading-5 text-muted">Have a team account? <a className="text-accent" href="/login">Sign in instead</a>.</p>
      </section>
    </main>
  );
}
