import {
  AlertTriangle,
  Bot,
  ChevronDown,
  CircleHelp,
  Database,
  GitBranch,
  Inbox,
  LogOut,
  MessageSquareText,
  Settings,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { OperatorSidebarActions } from "@/components/operator-sidebar-actions";
import type { SessionUser } from "@/lib/auth";

type ClientSection = "conversations" | "flows" | "knowledge" | "test" | "settings";
type OperatorSection =
  | "clients"
  | "conversations"
  | "quality"
  | "alerts";

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

type OperatorSidebarClient = {
  clientId: string;
  name: string;
  status: string;
  health?: "critical" | "warning" | "healthy";
};

const clientSidebarItems: ClientSidebarItem[] = [
  { href: "/client", label: "Conversations", section: "conversations", icon: MessageSquareText },
  { href: "/client/flows", label: "Flows", section: "flows", icon: GitBranch },
  { href: "/client/knowledge", label: "Knowledge", section: "knowledge", icon: Database },
  { href: "/client/test", label: "Test assistant", section: "test", icon: Bot },
  { href: "/client/settings", label: "Settings", section: "settings", icon: Settings },
];

const operatorWorkspaceItems: OperatorSidebarItem[] = [
  { href: "/operator", label: "Clients", section: "clients", icon: UserRound },
  { href: "/operator/conversations", label: "Conversations", section: "conversations", icon: MessageSquareText },
  { href: "/operator/quality", label: "Quality", section: "quality", icon: ShieldCheck },
  { href: "/operator#alerts", label: "Alerts", section: "alerts", icon: AlertTriangle },
];

export function AppShell({
  user,
  children,
  active,
  clientActive = "conversations",
  operatorActive = "clients",
  operatorClients = [],
  workspaceName,
}: {
  user: SessionUser;
  children: ReactNode;
  active: "operator" | "client";
  clientActive?: ClientSection;
  operatorActive?: OperatorSection;
  operatorClients?: OperatorSidebarClient[];
  workspaceName?: string;
}) {
  const primaryHref = user.role === "operator" ? "/operator" : "/client";
  const primaryLabel = user.role === "operator" ? "Operator" : "Client";
  const isClient = user.role === "client";

  return (
    <div className="min-h-screen bg-background text-foreground lg:flex">
      {isClient ? (
        <ClientSidebar
          active={clientActive}
          email={user.email}
          workspaceName={workspaceName ?? "Client workspace"}
        />
      ) : (
        <OperatorSidebar active={operatorActive} clients={operatorClients} email={user.email} />
      )}

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
                aria-current={active === user.role ? "page" : undefined}
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
          {isClient ? (
            <ClientMobileNav active={clientActive} />
          ) : (
            <OperatorMobileNav active={operatorActive} />
          )}
        </header>
        <main className="mx-auto w-full max-w-[1440px] px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
          {children}
        </main>
      </div>
    </div>
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
          className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-1 py-1 text-sm font-semibold hover:bg-sidebar-active"
        >
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-accent text-[10px] font-bold text-white">
            {initials || "P"}
          </span>
          <span className="truncate">{workspaceName}</span>
          <ChevronDown size={14} className="shrink-0 text-sidebar-muted" />
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 pb-3 text-sm">
        <div className="space-y-1">
          <ClientUtilityLink href="/client" icon={Inbox} label="Inbox" />
          <ClientUtilityLink href="/client?status=escalated" icon={CircleHelp} label="Needs reply" />
        </div>

        <div className="mt-8">
          <div className="mb-1 flex items-center justify-between px-2 text-xs font-medium text-sidebar-muted">
            <span>Workspace</span>
            <ChevronDown size={13} />
          </div>
          <div className="space-y-1">
            {clientSidebarItems.map((item) => {
              const Icon = item.icon;
              const isActive = active === item.section;

              return (
                <Link
                  key={item.section}
                  href={item.href}
                  className={`flex h-8 items-center gap-2 rounded-md px-2 font-medium ${
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
            className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-sm text-sidebar-muted hover:bg-sidebar-active hover:text-sidebar-foreground"
            title="Log out"
          >
            <LogOut size={15} />
            Log out
          </button>
        </form>
      </div>
    </aside>
  );
}

function OperatorSidebar({
  active,
  clients,
  email,
}: {
  active: OperatorSection;
  clients: OperatorSidebarClient[];
  email: string;
}) {
  return (
    <aside className="sticky top-0 hidden h-screen w-[18rem] shrink-0 flex-col border-r border-sidebar-line bg-sidebar text-sidebar-foreground lg:flex">
      <div className="flex items-center gap-2 px-4 py-4">
        <Link
          href="/operator"
          className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-1 py-1 text-sm font-semibold hover:bg-sidebar-active"
        >
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-sidebar-active text-[10px] font-bold text-sidebar-foreground">
            P
          </span>
          <span className="truncate">Pronto HQ</span>
          <ChevronDown size={14} className="shrink-0 text-sidebar-muted" />
        </Link>
        <OperatorSidebarActions />
      </div>

      <nav className="flex-1 overflow-y-auto px-3 pb-3 text-sm">
        <div>
          <div className="mb-1 flex items-center justify-between px-2 text-xs font-medium text-sidebar-muted">
            <span>Workspace</span>
            <ChevronDown size={13} />
          </div>
          <div className="space-y-1">
            {operatorWorkspaceItems.map((item) => (
              <OperatorSidebarLink key={item.section} item={item} active={active} />
            ))}
          </div>
        </div>

        {clients.length > 0 ? (
          <div className="mt-8">
            <div className="mb-1 flex items-center justify-between px-2 text-xs font-medium text-sidebar-muted">
              <span>Clients</span>
              <ChevronDown size={13} />
            </div>
            <div className="space-y-1">
              {clients.slice(0, 9).map((client) => (
                <Link
                  key={client.clientId}
                  href={`/operator/clients/${client.clientId}`}
                  className="flex h-8 items-center gap-2 rounded-md px-2 font-medium text-sidebar-muted hover:bg-sidebar-active hover:text-sidebar-foreground"
                >
                  <span className={`h-2 w-2 shrink-0 rounded-full ${healthDotClass(client.health)}`} />
                  <span className="min-w-0 flex-1 truncate">{client.name}</span>
                  <span className="shrink-0 rounded border border-sidebar-line px-1.5 py-0.5 text-[10px] uppercase leading-none text-sidebar-muted">
                    {client.status}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        ) : null}
      </nav>

      <div className="border-t border-sidebar-line p-3">
        <p className="truncate px-2 pb-2 text-xs text-sidebar-muted">{email}</p>
        <form action="/api/auth/logout" method="post">
          <button
            className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-sm text-sidebar-muted hover:bg-sidebar-active hover:text-sidebar-foreground"
            title="Log out"
          >
            <LogOut size={15} />
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
      className={`flex h-8 items-center gap-2 rounded-md px-2 font-medium ${
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

function ClientUtilityLink({
  href,
  icon: Icon,
  label,
}: {
  href: string;
  icon: typeof Inbox;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="flex h-8 items-center gap-2 rounded-md px-2 font-medium text-sidebar-muted hover:bg-sidebar-active hover:text-sidebar-foreground"
    >
      <Icon size={16} className="shrink-0" />
      <span className="truncate">{label}</span>
    </Link>
  );
}

function ClientMobileNav({ active }: { active: ClientSection }) {
  return (
    <nav className="flex gap-1 overflow-x-auto border-t border-line px-3 py-2 text-sm">
      {clientSidebarItems.map((item) => (
        <Link
          key={item.section}
          href={item.href}
          className={`shrink-0 rounded-md px-3 py-1.5 font-medium ${
            active === item.section
              ? "bg-surface text-foreground"
              : "text-muted hover:bg-surface-hover hover:text-foreground"
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
    <nav className="flex gap-1 overflow-x-auto border-t border-line px-3 py-2 text-sm">
      {operatorWorkspaceItems.map((item) => (
        <Link
          key={item.section}
          href={item.href}
          className={`shrink-0 rounded-md px-3 py-1.5 font-medium ${
            active === item.section
              ? "bg-surface text-foreground"
              : "text-muted hover:bg-surface-hover hover:text-foreground"
          }`}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

function healthDotClass(health: OperatorSidebarClient["health"]): string {
  if (health === "critical") {
    return "bg-danger";
  }
  if (health === "warning") {
    return "bg-warning";
  }
  return "bg-success";
}
