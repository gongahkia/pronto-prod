import { LogOut } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import type { SessionUser } from "@/lib/auth";

export function AppShell({
  user,
  children,
  active,
}: {
  user: SessionUser;
  children: ReactNode;
  active: "operator" | "client";
}) {
  return (
    <div className="min-h-screen">
      <header className="border-b border-line bg-panel">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <div>
            <Link href="/" className="text-lg font-semibold text-foreground">
              Pronto
            </Link>
            <p className="text-sm text-muted">AI customer service operations</p>
          </div>
          <nav className="flex items-center gap-3 text-sm">
            {user.role === "operator" ? (
              <a
                href="/operator"
                className={active === "operator" ? "font-semibold text-accent" : "text-muted"}
              >
                Operator
              </a>
            ) : null}
            {user.role === "client" ? (
              <a
                href="/client"
                className={active === "client" ? "font-semibold text-accent" : "text-muted"}
              >
                Client
              </a>
            ) : null}
            <span className="hidden text-muted sm:inline">{user.email}</span>
            <form action="/api/auth/logout" method="post">
              <button
                className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-line bg-white text-muted hover:text-foreground"
                title="Log out"
              >
                <LogOut size={16} />
              </button>
            </form>
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">{children}</main>
    </div>
  );
}
