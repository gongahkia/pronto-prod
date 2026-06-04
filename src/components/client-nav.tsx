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
    <nav className="mb-6 flex flex-wrap gap-2 border-b border-line pb-3 text-sm">
      {items.map((item) => (
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
