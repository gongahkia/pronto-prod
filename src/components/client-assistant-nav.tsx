import Link from "next/link";

const sections = [
  { href: "/client/knowledge", label: "Knowledge", key: "knowledge" },
  { href: "/client/assistant/channels", label: "Channels", key: "channels" },
  { href: "/client/assistant/voice", label: "Brand voice", key: "voice" },
  { href: "/client/assistant/rules", label: "Handoff rules", key: "rules" },
  { href: "/client/assistant", label: "Test & publish", key: "overview" },
] as const;

export type AssistantSection = (typeof sections)[number]["key"];

export function ClientAssistantNav({ active }: { active: AssistantSection }) {
  return (
    <nav aria-label="Assistant setup" className="mb-5 flex gap-2 overflow-x-auto pb-1">
      {sections.map((section) => (
        <Link
          key={section.key}
          href={section.href}
          aria-current={active === section.key ? "page" : undefined}
          className={`shrink-0 rounded-md px-3 py-2 text-sm font-medium ${active === section.key
            ? "bg-accent text-white"
            : "border border-line bg-panel text-muted hover:bg-surface-hover hover:text-foreground"}`}
        >
          {section.label}
        </Link>
      ))}
    </nav>
  );
}
