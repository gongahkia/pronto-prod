"use client";

import { Search, SquarePen, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { FormEvent } from "react";
import { useEffect, useRef, useState } from "react";

export function OperatorSidebarActions() {
  const router = useRouter();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (open) searchInputRef.current?.focus();
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [open]);

  function submit(event: FormEvent) {
    event.preventDefault();
    setOpen(false);
    router.push(`/operator/conversations?q=${encodeURIComponent(search.trim())}`);
  }

  return <>
    <button className="inline-flex h-8 w-8 items-center justify-center rounded-md text-sidebar-muted hover:bg-sidebar-active"
      title="Search conversations" aria-label="Search conversations" type="button" onClick={() => setOpen(true)}>
      <Search size={17} />
    </button>
    <Link href="/operator/clients/new" className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-sidebar-active text-sidebar-foreground"
      title="Create client" aria-label="Create client"><SquarePen size={17} /></Link>
    {open ? <div className="fixed inset-0 z-[100] bg-black/30" role="presentation" onMouseDown={() => setOpen(false)}>
      <section className="absolute left-4 top-16 w-[min(31rem,calc(100vw-2rem))] rounded-lg border border-line bg-panel p-4 shadow-xl lg:left-[19.25rem]"
        role="dialog" aria-modal="true" aria-label="Search conversations" onMouseDown={(event) => event.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between"><h2 className="font-semibold">Find a conversation</h2>
          <button type="button" aria-label="Close" onClick={() => setOpen(false)}><X size={17} /></button></div>
        <form onSubmit={submit} className="flex gap-2"><input ref={searchInputRef} value={search}
          onChange={(event) => setSearch(event.target.value)} aria-label="Business, customer, or message"
          className="ui-input min-w-0 flex-1 px-3 py-2" placeholder="Business, customer, or message" />
          <button className="ui-primary-button px-4 py-2">Search</button></form>
        <Link href="/operator/conversations?status=escalated" onClick={() => setOpen(false)}
          className="mt-3 inline-block text-sm text-accent">See human-owned conversations</Link>
      </section>
    </div> : null}
  </>;
}
