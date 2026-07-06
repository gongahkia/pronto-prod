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
  | "knowledge"
  | "conversations"
  | "users"
  | "offboarding";

const clientItems: OperatorClientNavItem[] = [
  { href: (clientId) => `/operator/clients/${clientId}`, label: "Overview", key: "overview" },
  { href: (clientId) => `/operator/clients/${clientId}/channels`, label: "Channels", key: "channels" },
  { href: (clientId) => `/operator/clients/${clientId}/knowledge`, label: "Knowledge", key: "knowledge" },
  { href: (clientId) => `/operator/clients/${clientId}/conversations`, label: "Conversations", key: "conversations" },
  { href: (clientId) => `/operator/clients/${clientId}/users`, label: "Users", key: "users" },
  { href: (clientId) => `/operator/clients/${clientId}/offboarding`, label: "Offboarding", key: "offboarding" },
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
          Back to operator dashboard
        </Link>
        <h1 className="mt-1.5 text-xl font-semibold">{client.name}</h1>
        <p className="max-w-3xl text-sm text-muted">{description ?? client.brand_voice}</p>
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
    <nav className="mb-5 flex flex-wrap gap-1 rounded-lg border border-line bg-panel p-1 text-sm">
      {clientItems.map((item) => (
        <Link
          key={item.key}
          href={item.href(clientId)}
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
