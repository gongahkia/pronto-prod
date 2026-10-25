import Link from "next/link";
import type { SessionUser } from "@/lib/auth";

export function AccountAccess({ user, reason }: { user: SessionUser; reason: string }) {
  const message = reason === "membership"
    ? "This account has no business membership. Ask an administrator to assign the correct business."
    : reason === "permission"
      ? "This business account does not have permission to review or respond to conversations. Ask your business administrator for access."
      : reason === "operator-role"
        ? "This action requires a Pronto operator account. Business accounts cannot use administrative APIs."
        : "The business inbox requires a business staff account with conversation access. A Pronto operator account does not grant business-owner access.";
  return <main className="min-h-screen bg-background px-4 py-10 text-foreground">
    <section className="ui-panel mx-auto max-w-xl space-y-4 p-6">
      <h1 className="text-xl font-semibold">Business inbox access</h1>
      <p className="text-sm text-muted">{message}</p>
      <p className="text-sm">Signed in as {user.email} ({user.role}).</p>
      <form action="/api/auth/logout" method="post">
        <input type="hidden" name="next" value="/client/inbox"/>
        <button className="ui-primary-button px-4 py-2">Sign out and switch account</button>
      </form>
      <p className="text-xs text-muted">Tabs in the same browser profile share this sign-in. Use a separate browser profile or private window to keep operator and business sessions separate.</p>
      <Link href="/account" className="inline-block text-sm text-accent">Account details</Link>
    </section>
  </main>;
}
