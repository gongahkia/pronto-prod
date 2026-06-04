import Link from "next/link";
import type { Client } from "@/lib/types";
import { Badge } from "@/components/badge";

type OperatorNavItem = {
  href: string;
  label: string;
  key: OperatorTab;
};

export type OperatorTab = "clients" | "escalations" | "conversations" | "quality" | "settings";

const operatorItems: OperatorNavItem[] = [
  { href: "/operator", label: "Clients", key: "clients" },
  { href: "/operator/escalations", label: "Escalations", key: "escalations" },
  { href: "/operator/conversations", label: "Conversations", key: "conversations" },
  { href: "/operator/quality", label: "Quality", key: "quality" },
  { href: "/operator/settings", label: "Settings", key: "settings" },
];

export function OperatorNav({ active }: { active: OperatorTab }) {
  return (
    <nav className="mb-6 flex flex-wrap gap-2 border-b border-line pb-3 text-sm">
      {operatorItems.map((item) => (
        <Link
          key={item.key}
          href={item.href}
          className={`rounded-md px-3 py-2 font-medium ${
            active === item.key
              ? "bg-accent text-white"
              : "text-muted hover:bg-stone-100 hover:text-foreground"
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
  | "escalations"
  | "conversations"
  | "test"
  | "offboarding";

const clientItems: OperatorClientNavItem[] = [
  { href: (clientId) => `/operator/clients/${clientId}`, label: "Overview", key: "overview" },
  { href: (clientId) => `/operator/clients/${clientId}/channels`, label: "Channels", key: "channels" },
  { href: (clientId) => `/operator/clients/${clientId}/knowledge`, label: "Knowledge", key: "knowledge" },
  { href: (clientId) => `/operator/clients/${clientId}/escalations`, label: "Escalations", key: "escalations" },
  { href: (clientId) => `/operator/clients/${clientId}/conversations`, label: "Conversations", key: "conversations" },
  { href: (clientId) => `/operator/clients/${clientId}/test`, label: "Test", key: "test" },
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
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <Link href="/operator" className="text-sm text-accent">
          Back to operator dashboard
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">{client.name}</h1>
        <p className="text-sm text-muted">{description ?? client.brand_voice}</p>
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
    <nav className="mb-6 flex flex-wrap gap-2 border-b border-line pb-3 text-sm">
      {clientItems.map((item) => (
        <Link
          key={item.key}
          href={item.href(clientId)}
          className={`rounded-md px-3 py-2 font-medium ${
            active === item.key
              ? "bg-accent text-white"
              : "text-muted hover:bg-stone-100 hover:text-foreground"
          }`}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
