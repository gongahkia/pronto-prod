import { Inbox, LogOut, BookOpenText, Radio, Clock3 } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { AutoRefresh } from "@/components/auto-refresh";
import { MockAiBanner } from "@/components/mock-ai-banner";
import type { SessionUser } from "@/lib/auth";
import { getMockAiStatus } from "@/lib/llm/mock-status";

type ClientSection = "attention" | "activity" | "knowledge" | "channels" |
  "overview" | "inbox" | "assistant" | "settings";
type ClientSidebarItem = { href: string; label: string; section: ClientSection; icon: typeof Inbox };
const clientSidebarItems: ClientSidebarItem[] = [
  { href: "/client/inbox", label: "Inbox", section: "inbox", icon: Inbox },
  { href: "/client", label: "Needs Attention", section: "attention", icon: Inbox },
  { href: "/client/activity", label: "Recent Activity", section: "activity", icon: Clock3 },
  { href: "/client/knowledge", label: "Business Knowledge", section: "knowledge", icon: BookOpenText },
  { href: "/client/channels", label: "Connected Channels", section: "channels", icon: Radio },
];

export function AppShell({ user, children, clientActive = "attention", workspaceName }: {
  user: SessionUser; children: ReactNode; active: "client";
  clientActive?: ClientSection; workspaceName?: string;
}) {
  if (user.role !== "client") throw new Error("The business workspace requires a business account.");
  return <>
    <MockAiBanner status={getMockAiStatus()} customerDemoEnabled={process.env.PRONTO_CUSTOMER_DEMO_ENABLED === "1" && process.env.NODE_ENV !== "production"}/>
    <AutoRefresh/>
    <a href="#main-content" className="skip-link">Skip to main content</a>
    <div className="min-h-screen bg-background text-foreground lg:flex">
      <ClientSidebar active={clientActive} email={user.email} workspaceName={workspaceName ?? "Client workspace"}/>
      <div className="min-w-0 flex-1">
        <header className="border-b border-line bg-panel/95 backdrop-blur lg:hidden">
          <div className="flex items-center justify-between px-4 py-3">
            <Link href="/client/inbox" className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-accent text-white">P</span>Pronto
            </Link>
            <div className="min-w-0 flex-1 px-3">
              <p className="truncate text-sm font-medium">{workspaceName ?? "Client workspace"}</p>
              <p className="truncate text-xs text-muted">{user.email}</p>
            </div>
            <form action="/api/auth/logout" method="post">
              <button className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-line bg-panel text-muted hover:bg-surface-hover hover:text-link" title="Log out" aria-label="Log out">
                <LogOut size={15} aria-hidden="true"/>
              </button>
            </form>
          </div>
          <ClientMobileNav active={clientActive}/>
        </header>
        <main id="main-content" className="mx-auto w-full max-w-[1440px] px-4 py-5 sm:px-6 lg:px-8 lg:py-6">{children}</main>
      </div>
    </div>
  </>;
}

function ClientSidebar({
  active,
  email,
  workspaceName,
}: {
  active: ClientSection;
  email: string;
  workspaceName: string;
}) {
  const initials = workspaceName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  return (
    <aside className="sticky top-0 hidden h-screen w-[18rem] shrink-0 flex-col border-r border-sidebar-line bg-sidebar text-sidebar-foreground lg:flex">
      <div className="flex items-center gap-2 px-4 py-4">
        <Link
          href="/client"
          className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-1 py-1 text-base font-medium hover:bg-sidebar-active"
        >
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-white text-xs font-bold text-sidebar">
            {initials || "P"}
          </span>
          <span className="truncate">{workspaceName}</span>
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 pb-3 text-base">
        <div>
          <div className="mb-2 flex items-center justify-between px-2 text-sm font-medium text-sidebar-muted">
            <span>Workspace</span>
          </div>
          <div className="space-y-1">
            {clientSidebarItems.map((item) => {
              const Icon = item.icon;
              const isActive = active === item.section;

              return (
                <Link
                  key={item.section}
                  href={item.href}
                  aria-current={isActive ? "page" : undefined}
                  className={`flex h-9 items-center gap-2 rounded-md px-2 font-medium ${
                    isActive
                      ? "bg-sidebar-active text-sidebar-foreground"
                      : "text-sidebar-muted hover:bg-sidebar-active hover:text-sidebar-foreground"
                  }`}
                >
                  <Icon size={16} className="shrink-0" />
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      </nav>

      <div className="border-t border-sidebar-line p-3">
        <details className="mb-2 px-2 text-xs text-sidebar-muted"><summary className="cursor-pointer">More tools</summary>
          <div className="mt-2 flex flex-col gap-2">
            <Link href="/client/inbox">All conversations</Link>
            <Link href="/client/assistant">Test an answer</Link>
            <Link href="/client/settings">Preferences and permissions</Link>
          </div>
        </details>
        <p className="truncate px-2 pb-2 text-xs text-sidebar-muted">{email}</p>
        <form action="/api/auth/logout" method="post">
          <button
            className="flex h-9 w-full items-center gap-2 rounded-md px-2 text-sm text-sidebar-muted hover:bg-sidebar-active hover:text-sidebar-foreground"
            title="Log out"
          >
            <LogOut size={15} aria-hidden="true" />
            Log out
          </button>
        </form>
      </div>
    </aside>
  );
}

function ClientMobileNav({ active }: { active: ClientSection }) {
  return (
    <nav className="flex gap-1 overflow-x-auto border-t border-line px-3 py-2 text-base">
      {clientSidebarItems.map((item) => (
        <Link
          key={item.section}
          href={item.href}
          aria-current={active === item.section ? "page" : undefined}
          className={`shrink-0 rounded-md px-3 py-1.5 font-medium ${
            active === item.section
              ? "bg-surface text-link"
              : "text-muted hover:bg-surface-hover hover:text-link"
          }`}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
