import Link from "next/link";
import type { Client } from "@/lib/types";
import { Badge } from "@/components/badge";

type OperatorNavItem = {
  href: string;
  label: string;
  key: OperatorTab;
};

export type OperatorTab = "clients" | "conversations" | "settings";

const operatorItems: OperatorNavItem[] = [
  { href: "/operator", label: "Clients", key: "clients" },
  { href: "/operator/conversations", label: "Conversations", key: "conversations" },
];

export function OperatorNav({ active }: { active: OperatorTab }) {
  return (
    <nav className="mb-5 flex flex-wrap gap-1 rounded-lg border border-line bg-panel p-1 text-sm">
      {operatorItems.map((item) => (
        <Link
          key={item.key}
          href={item.href}
          className={`rounded-md px-3 py-1.5 font-medium ${
            active === item.key
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

type OperatorClientNavItem = {
  href: (clientId: string) => string;
  label: string;
  key: OperatorClientTab;
};

export type OperatorClientTab =
  | "overview"
  | "channels"
  | "integrations"
  | "knowledge"
  | "flows"
  | "conversations"
  | "users"
  | "offboarding";

const clientItems: OperatorClientNavItem[] = [
  { href: (clientId) => `/operator/clients/${clientId}`, label: "Overview", key: "overview" },
  { href: (clientId) => `/operator/clients/${clientId}/channels`, label: "Channels", key: "channels" },
  { href: (clientId) => `/operator/clients/${clientId}/knowledge`, label: "Knowledge", key: "knowledge" },
  { href: (clientId) => `/operator/clients/${clientId}/conversations`, label: "Conversations", key: "conversations" },
  { href: (clientId) => `/operator/clients/${clientId}/integrations`, label: "Integrations", key: "integrations" },
];

const additionalClientItems: OperatorClientNavItem[] = [
  { href: (clientId) => `/operator/clients/${clientId}/flows`, label: "Handoff flow", key: "flows" },
  { href: (clientId) => `/operator/clients/${clientId}/users`, label: "Users", key: "users" },
  { href: (clientId) => `/operator/clients/${clientId}/offboarding`, label: "Data & offboarding", key: "offboarding" },
];

export function OperatorClientHeader({
  client,
  description,
}: {
  client: Client;
  description?: string;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
      <div>
        <Link href="/operator" className="text-xs font-medium text-accent hover:text-accent-dark">
          All clients
        </Link>
        <h1 className="mt-1.5 text-xl font-semibold">{client.name}</h1>
        <p className="max-w-3xl text-sm text-muted">{description ?? "Manage customer conversations, channels, and business knowledge."}</p>
      </div>
      <Badge tone="amber">{client.status}</Badge>
    </div>
  );
}

export function OperatorClientNav({
  clientId,
  active,
}: {
  clientId: string;
  active: OperatorClientTab;
}) {
  return (
    <nav aria-label="Business workspace" className="mb-5 flex flex-wrap items-center gap-1 rounded-lg border border-line bg-panel p-1 text-sm">
      {clientItems.map((item) => (
        <Link
          key={item.key}
          href={item.href(clientId)}
          aria-current={active === item.key ? "page" : undefined}
          className={`rounded-md px-3 py-1.5 font-medium ${
            active === item.key
              ? "bg-surface text-link"
              : "text-muted hover:bg-surface-hover hover:text-link"
          }`}
        >
          {item.label}
        </Link>
      ))}
      <details className="relative">
        <summary className={`cursor-pointer list-none rounded-md px-3 py-1.5 font-medium ${additionalClientItems.some((item) => item.key === active) ? "bg-surface text-link" : "text-muted hover:bg-surface-hover hover:text-link"}`}>
          More settings
        </summary>
        <div className="absolute left-0 top-full z-30 mt-1 min-w-44 rounded-md border border-line bg-panel p-1 shadow-lg">
          {additionalClientItems.map((item) => (
            <Link key={item.key} href={item.href(clientId)} aria-current={active === item.key ? "page" : undefined}
              className={`block rounded-md px-3 py-2 ${active === item.key ? "bg-surface text-link" : "text-muted hover:bg-surface-hover hover:text-link"}`}>
              {item.label}
            </Link>
          ))}
        </div>
      </details>
    </nav>
  );
}
