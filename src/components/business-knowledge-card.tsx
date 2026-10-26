import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import type { ReactNode } from "react";

export function BusinessKnowledgeCard({ id, href, title, icon, status, description, children, action }: {
  id: string; href: string; title: string; icon: ReactNode; status?: ReactNode;
  description: string; children: ReactNode; action: string;
}) {
  return <Link id={id} href={href} aria-label={`View ${title.toLowerCase()} details`}
    className="ui-panel group block scroll-mt-6 overflow-hidden transition-colors hover:border-accent/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
    <div className="p-5"><div className="flex flex-wrap items-center gap-3">{icon}<h2 className="text-lg font-semibold">{title}</h2>
      <span className="ml-auto">{status}</span></div><p className="mt-2 text-sm text-muted">{description}</p></div>
    {children}
    <div className="flex items-center justify-between gap-3 border-t border-line px-5 py-4 text-sm font-medium text-accent group-hover:bg-surface-hover">
      {action}<ArrowRight size={17} aria-hidden="true"/>
    </div>
  </Link>;
}

export function BusinessKnowledgeDetailHeader({ title, description, status }: { title: string; description: string; status?: ReactNode }) {
  return <div className="mb-6 flex flex-wrap items-center gap-3">
    <Link href="/client/knowledge" aria-label="Back to business knowledge" title="Back to business knowledge"
      className="-ml-2 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted hover:bg-surface-hover hover:text-foreground">
      <ArrowLeft size={20} aria-hidden="true"/>
    </Link>
    <div className="min-w-0 flex-1"><h1 className="text-2xl font-semibold">{title}</h1><p className="mt-1 text-sm text-muted">{description}</p></div>
    {status}
  </div>;
}
