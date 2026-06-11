import { BotMessageSquare } from "lucide-react";
import { getSessionUser } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await getSessionUser();
  if (user) {
    redirect(user.role === "operator" ? "/operator" : "/client");
  }
  const params = await searchParams;
  const showSeedCredentials = process.env.NODE_ENV !== "production";

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <section className="w-full max-w-md ui-panel p-6">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-accent text-white">
            <BotMessageSquare size={22} />
          </div>
          <div>
            <h1 className="text-xl font-semibold">Pronto MVP</h1>
            <p className="text-sm text-muted">Sign in to operate customer-service agents.</p>
          </div>
        </div>
        {params.error ? (
          <p className="mb-4 rounded-md border border-danger/25 bg-danger-bg px-3 py-2 text-sm text-danger">
            Invalid email or password.
          </p>
        ) : null}
        <form action="/api/auth/login" method="post" className="space-y-4">
          <label className="block text-sm font-medium">
            Email
            <input
              name="email"
              type="email"
              autoComplete="username"
              required
              className="mt-1 w-full rounded-md border border-line px-3 py-2 outline-none focus:border-accent"
              placeholder="operator@pronto.sg"
            />
          </label>
          <label className="block text-sm font-medium">
            Password
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
              className="mt-1 w-full rounded-md border border-line px-3 py-2 outline-none focus:border-accent"
              placeholder="pronto-operator"
            />
          </label>
          <button className="w-full rounded-md bg-accent px-4 py-2.5 text-sm font-semibold text-white hover:bg-accent-dark">
            Sign in
          </button>
        </form>
        {showSeedCredentials ? (
          <div className="mt-5 rounded-md bg-surface p-3 text-xs text-muted">
            <p>Seed credentials after `pnpm db:seed`:</p>
            <p>operator@pronto.sg / pronto-operator</p>
            <p>owner@northbridgenasi.sg / pronto-client</p>
          </div>
        ) : null}
      </section>
    </main>
  );
}
