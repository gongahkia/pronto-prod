import Link from "next/link";

type ClientNavItem = {
  href: string;
  label: string;
  key: ClientTab;
};

export type ClientTab = "conversations" | "escalations" | "knowledge" | "test" | "settings";

const items: ClientNavItem[] = [
  { href: "/client", label: "Conversations", key: "conversations" },
  { href: "/client/escalations", label: "Escalations", key: "escalations" },
  { href: "/client/knowledge", label: "Knowledge", key: "knowledge" },
  { href: "/client/test", label: "Test assistant", key: "test" },
  { href: "/client/settings", label: "Settings", key: "settings" },
];

export function ClientNav({ active }: { active: ClientTab }) {
  return (
    <nav className="mb-5 flex flex-wrap gap-1 rounded-md border border-line bg-panel p-1 text-sm">
      {items.map((item) => (
        <Link
          key={item.key}
          href={item.href}
          className={`rounded-[5px] px-3 py-1.5 font-medium ${
            active === item.key
              ? "bg-surface text-foreground shadow-[0_1px_1px_rgba(15,23,42,0.05)]"
              : "text-muted hover:bg-surface-hover hover:text-foreground"
          }`}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
