import {
  Bot,
  ChevronDown,
  Database,
  Inbox,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquareText,
  Settings,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { AutoRefresh } from "@/components/auto-refresh";
import { MockAiBanner } from "@/components/mock-ai-banner";
import { OperatorSidebarActions } from "@/components/operator-sidebar-actions";
import type { SessionUser } from "@/lib/auth";
import { getMockAiStatus } from "@/lib/llm/mock-status";

type ClientSection = "overview" | "inbox" | "knowledge" | "assistant" | "settings";
type OperatorSection =
  | "clients"
  | "conversations";

type ClientSidebarItem = {
  href: string;
  label: string;
  section: ClientSection;
  icon: typeof Inbox;
};

type OperatorSidebarItem = {
  href: string;
  label: string;
  section: OperatorSection;
  icon: typeof Inbox;
};

const clientSidebarItems: ClientSidebarItem[] = [
  { href: "/client", label: "Overview", section: "overview", icon: LayoutDashboard },
  { href: "/client/inbox", label: "Inbox", section: "inbox", icon: Inbox },
  { href: "/client/knowledge", label: "Knowledge", section: "knowledge", icon: Database },
  { href: "/client/assistant", label: "Assistant", section: "assistant", icon: Bot },
  { href: "/client/settings", label: "Settings", section: "settings", icon: Settings },
];

const operatorWorkspaceItems: OperatorSidebarItem[] = [
  { href: "/operator", label: "Clients", section: "clients", icon: UserRound },
  { href: "/operator/conversations", label: "Conversations", section: "conversations", icon: MessageSquareText },
];

export function AppShell({
  user,
  children,
  active,
  clientActive = "overview",
  operatorActive = "clients",
  workspaceName,
}: {
  user: SessionUser;
  children: ReactNode;
  active: "operator" | "client";
  clientActive?: ClientSection;
  operatorActive?: OperatorSection;
  workspaceName?: string;
}) {
  const primaryHref = user.role === "operator" ? "/operator" : "/client";
  const primaryLabel = user.role === "operator" ? "Operator" : "Client";
  const isClient = user.role === "client";
  const mockAiStatus = getMockAiStatus();

  return (
    <>
      <MockAiBanner status={mockAiStatus} />
      <AutoRefresh />
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      <div className="min-h-screen bg-background text-foreground lg:flex">
        {isClient ? (
          <ClientSidebar
            active={clientActive}
            email={user.email}
            workspaceName={workspaceName ?? "Client workspace"}
          />
        ) : (
          <OperatorSidebar active={operatorActive} email={user.email} />
        )}

        <div className="min-w-0 flex-1">
          <header className="border-b border-line bg-panel/95 backdrop-blur lg:hidden">
            <div className="flex items-center justify-between px-4 py-3">
              <Link href="/" className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <span className="flex h-7 w-7 items-center justify-center rounded-md bg-accent text-white">
                  P
                </span>
                Pronto
              </Link>
              <div className="min-w-0 flex-1 px-3">
                <p className="truncate text-sm font-medium">
                  {isClient ? workspaceName ?? "Client workspace" : "Pronto HQ"}
                </p>
                <p className="truncate text-xs text-muted">{user.email}</p>
              </div>
              <div className="flex items-center gap-2">
                <MobileMenu
                  isClient={isClient}
                  clientActive={clientActive}
                  operatorActive={operatorActive}
                />
                <Link
                  href={primaryHref}
                  aria-current={active === user.role ? "page" : undefined}
                  className="rounded-md bg-surface px-2.5 py-1.5 text-sm font-medium text-link"
                >
                  {primaryLabel}
                </Link>
                <form action="/api/auth/logout" method="post">
                  <button
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-line bg-panel text-muted hover:bg-surface-hover hover:text-link"
                    title="Log out"
                    aria-label="Log out"
                  >
                    <LogOut size={15} aria-hidden="true" />
                  </button>
                </form>
              </div>
            </div>
            {isClient ? (
              <ClientMobileNav active={clientActive} />
            ) : (
              <OperatorMobileNav active={operatorActive} />
            )}
          </header>
          <main id="main-content" className="mx-auto w-full max-w-[1440px] px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
            {children}
          </main>
        </div>
      </div>
    </>
  );
}

function MobileMenu({
  isClient,
  clientActive,
  operatorActive,
}: {
  isClient: boolean;
  clientActive: ClientSection;
  operatorActive: OperatorSection;
}) {
  const items = isClient ? clientSidebarItems : operatorWorkspaceItems;
  return (
    <details className="relative">
      <summary
        className="inline-flex h-8 w-8 cursor-pointer list-none items-center justify-center rounded-md border border-line bg-panel text-muted hover:bg-surface-hover hover:text-link"
        aria-label="Open navigation menu"
      >
        <Menu size={15} aria-hidden="true" />
      </summary>
      <div className="absolute right-0 top-10 z-40 w-56 rounded-lg border border-line bg-panel p-2 shadow-xl">
        <nav className="space-y-1" aria-label="Mobile navigation">
          {items.map((item) => {
            const active =
              isClient
                ? item.section === clientActive
                : item.section === operatorActive;
            return (
              <Link
                key={item.section}
                href={item.href}
                className={`block rounded-md px-3 py-2 text-sm font-medium ${
                  active ? "bg-surface text-link" : "text-muted hover:bg-surface-hover hover:text-link"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </details>
  );
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
          <ChevronDown size={14} className="shrink-0 text-sidebar-muted" aria-hidden="true" />
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 pb-3 text-base">
        <div>
          <div className="mb-2 flex items-center justify-between px-2 text-sm font-medium text-sidebar-muted">
            <span>Workspace</span>
            <ChevronDown size={13} aria-hidden="true" />
          </div>
          <div className="space-y-1">
            {clientSidebarItems.map((item) => {
              const Icon = item.icon;
              const isActive = active === item.section;

              return (
                <Link
                  key={item.section}
                  href={item.href}
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

function OperatorSidebar({
  active,
  email,
}: {
  active: OperatorSection;
  email: string;
}) {
  return (
    <aside className="sticky top-0 hidden h-screen w-[18rem] shrink-0 flex-col border-r border-sidebar-line bg-sidebar text-sidebar-foreground lg:flex">
      <div className="flex items-center gap-2 px-4 py-4">
        <Link
          href="/operator"
          className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-1 py-1 text-base font-medium hover:bg-sidebar-active"
        >
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-white text-xs font-bold text-sidebar">
            P
          </span>
          <span className="truncate">Pronto HQ</span>
          <ChevronDown size={14} className="shrink-0 text-sidebar-muted" aria-hidden="true" />
        </Link>
        <OperatorSidebarActions />
      </div>

      <nav className="flex-1 overflow-y-auto px-3 pb-3 text-base">
        <div>
          <div className="mb-2 flex items-center justify-between px-2 text-sm font-medium text-sidebar-muted">
            <span>Workspace</span>
            <ChevronDown size={13} aria-hidden="true" />
          </div>
          <div className="space-y-1">
            {operatorWorkspaceItems.map((item) => (
              <OperatorSidebarLink key={item.section} item={item} active={active} />
            ))}
          </div>
        </div>
      </nav>

      <div className="border-t border-sidebar-line p-3">
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

function OperatorSidebarLink({
  item,
  active,
}: {
  item: OperatorSidebarItem;
  active: OperatorSection;
}) {
  const Icon = item.icon;
  const isActive = item.section === active;

  return (
    <Link
      href={item.href}
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
}

function ClientMobileNav({ active }: { active: ClientSection }) {
  return (
    <nav className="flex gap-1 overflow-x-auto border-t border-line px-3 py-2 text-base">
      {clientSidebarItems.map((item) => (
        <Link
          key={item.section}
          href={item.href}
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

function OperatorMobileNav({ active }: { active: OperatorSection }) {
  return (
    <nav className="flex gap-1 overflow-x-auto border-t border-line px-3 py-2 text-base">
      {operatorWorkspaceItems.map((item) => (
        <Link
          key={item.section}
          href={item.href}
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
