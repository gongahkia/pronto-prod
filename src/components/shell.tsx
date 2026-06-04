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
  const primaryHref = user.role === "operator" ? "/operator" : "/client";
  const primaryLabel = user.role === "operator" ? "Operator" : "Client";

  return (
    <div className="min-h-screen bg-background text-foreground lg:flex">
      <aside className="hidden min-h-screen w-64 shrink-0 flex-col border-r border-sidebar-line bg-sidebar text-sidebar-foreground lg:flex">
        <div className="border-b border-sidebar-line px-4 py-4">
          <Link href="/" className="flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-sidebar-active text-sm font-semibold">
              P
            </span>
            <span>
              <span className="block text-sm font-semibold">Pronto</span>
              <span className="block text-xs text-sidebar-muted">AI service ops</span>
            </span>
          </Link>
        </div>

        <nav className="flex-1 space-y-1 px-3 py-3 text-sm">
          <Link
            href={primaryHref}
            className={`flex items-center justify-between rounded-md px-3 py-2 font-medium ${
              active === user.role
                ? "bg-sidebar-active text-sidebar-foreground"
                : "text-sidebar-muted hover:bg-sidebar-active hover:text-sidebar-foreground"
            }`}
          >
            <span>{primaryLabel}</span>
            <span className="rounded border border-sidebar-line px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-sidebar-muted">
              {user.role}
            </span>
          </Link>
        </nav>

        <div className="border-t border-sidebar-line p-3">
          <p className="truncate px-2 pb-2 text-xs text-sidebar-muted">{user.email}</p>
          <form action="/api/auth/logout" method="post">
            <button
              className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm text-sidebar-muted hover:bg-sidebar-active hover:text-sidebar-foreground"
              title="Log out"
            >
              <LogOut size={15} />
              Log out
            </button>
          </form>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="border-b border-line bg-panel/90 backdrop-blur lg:hidden">
          <div className="flex items-center justify-between px-4 py-3">
            <Link href="/" className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-accent text-white">
                P
              </span>
              Pronto
            </Link>
            <div className="flex items-center gap-2">
              <Link
                href={primaryHref}
                className="rounded-md bg-surface px-2.5 py-1.5 text-sm font-medium text-foreground"
              >
                {primaryLabel}
              </Link>
              <form action="/api/auth/logout" method="post">
                <button
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-line bg-panel text-muted hover:bg-surface-hover hover:text-foreground"
                  title="Log out"
                >
                  <LogOut size={15} />
                </button>
              </form>
            </div>
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1440px] px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
          {children}
        </main>
      </div>
    </div>
  );
}
