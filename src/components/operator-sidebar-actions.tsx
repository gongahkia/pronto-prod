"use client";

import { Search, SquarePen, X } from "lucide-react";
import { useRouter } from "next/navigation";
import type { FormEvent } from "react";
import { useEffect, useRef, useState } from "react";

type ActionMode = "search" | "create" | null;

export function OperatorSidebarActions() {
  const router = useRouter();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<ActionMode>(null);
  const [query, setQuery] = useState("");
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMode(null);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    if (mode === "search") {
      searchInputRef.current?.focus();
    }
    if (mode === "create") {
      nameInputRef.current?.focus();
    }
  }, [mode]);

  function submitSearch(event: FormEvent) {
    event.preventDefault();
    const value = query.trim();
    setMode(null);
    router.push(value ? `/operator/conversations?q=${encodeURIComponent(value)}` : "/operator/conversations");
  }

  function updateName(value: string) {
    setName(value);
    if (!slugEdited) {
      setSlug(normalizeSlug(value));
    }
  }

  function openRoute(href: string) {
    setMode(null);
    router.push(href);
  }

  return (
    <>
      <button
        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-sidebar-muted hover:bg-sidebar-active hover:text-sidebar-foreground"
        title="Search operator workspace"
        type="button"
        onClick={() => setMode("search")}
      >
        <Search size={17} />
      </button>
      <button
        className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-sidebar-active text-sidebar-foreground hover:bg-sidebar-line"
        title="Create client"
        type="button"
        onClick={() => setMode("create")}
      >
        <SquarePen size={17} />
      </button>

      {mode ? (
        <div
          className="fixed inset-0 z-40 bg-black/20"
          role="presentation"
          onMouseDown={() => setMode(null)}
        >
          <section
            className="absolute left-4 top-16 w-[min(31rem,calc(100vw-2rem))] rounded-lg border border-line bg-panel text-foreground lg:left-[19.25rem]"
            role="dialog"
            aria-modal="true"
            aria-label={mode === "search" ? "Search operator workspace" : "Create client"}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <h2 className="text-sm font-semibold">
                {mode === "search" ? "Search operator workspace" : "Create client"}
              </h2>
              <button
                className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted hover:bg-surface-hover hover:text-foreground"
                title="Close"
                type="button"
                onClick={() => setMode(null)}
              >
                <X size={16} />
              </button>
            </div>

            {mode === "search" ? (
              <form onSubmit={submitSearch} className="space-y-3 p-4">
                <div className="flex gap-2">
                  <input
                    ref={searchInputRef}
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    className="min-w-0 flex-1 rounded-md border border-line bg-input px-3 py-2 text-sm outline-none focus:border-accent"
                    placeholder="Client, customer, message"
                  />
                  <button className="ui-primary-button px-4 py-2" type="submit">
                    Search
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    className="ui-button px-3 py-2"
                    type="button"
                    onClick={() => openRoute("/operator/conversations?status=escalated")}
                  >
                    Escalated
                  </button>
                  <button
                    className="ui-button px-3 py-2"
                    type="button"
                    onClick={() => openRoute("/operator/quality")}
                  >
                    Quality
                  </button>
                  <button
                    className="ui-button px-3 py-2"
                    type="button"
                    onClick={() => openRoute("/operator")}
                  >
                    Clients
                  </button>
                </div>
              </form>
            ) : (
              <form action="/api/operator/clients" method="post" className="space-y-4 p-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="grid gap-1 text-sm sm:col-span-2">
                    <span className="font-medium">Client name</span>
                    <input
                      ref={nameInputRef}
                      name="name"
                      value={name}
                      onChange={(event) => updateName(event.target.value)}
                      className="rounded-md border border-line bg-input px-3 py-2 outline-none focus:border-accent"
                      placeholder="Acme Service Co"
                      required
                    />
                  </label>
                  <label className="grid gap-1 text-sm">
                    <span className="font-medium">Slug</span>
                    <input
                      name="slug"
                      value={slug}
                      onChange={(event) => {
                        setSlugEdited(true);
                        setSlug(normalizeSlug(event.target.value));
                      }}
                      className="rounded-md border border-line bg-input px-3 py-2 outline-none focus:border-accent"
                      placeholder="acme-service-co"
                      required
                    />
                  </label>
                  <label className="grid gap-1 text-sm">
                    <span className="font-medium">Vertical</span>
                    <input
                      name="vertical"
                      className="rounded-md border border-line bg-input px-3 py-2 outline-none focus:border-accent"
                      placeholder="F&B, retail, clinic"
                      defaultValue="general"
                    />
                  </label>
                  <label className="grid gap-1 text-sm">
                    <span className="font-medium">Plan</span>
                    <select
                      name="planTier"
                      className="rounded-md border border-line bg-input px-3 py-2 outline-none focus:border-accent"
                      defaultValue="pilot"
                    >
                      <option value="pilot">Pilot</option>
                      <option value="growth">Growth</option>
                      <option value="scale">Scale</option>
                    </select>
                  </label>
                  <label className="grid gap-1 text-sm">
                    <span className="font-medium">Status</span>
                    <select
                      name="status"
                      className="rounded-md border border-line bg-input px-3 py-2 outline-none focus:border-accent"
                      defaultValue="pilot"
                    >
                      <option value="draft">Draft</option>
                      <option value="pilot">Pilot</option>
                      <option value="live">Live</option>
                      <option value="paused">Paused</option>
                    </select>
                  </label>
                </div>

                <label className="grid gap-1 text-sm">
                  <span className="font-medium">Brand voice</span>
                  <textarea
                    name="brandVoice"
                    className="min-h-24 rounded-md border border-line bg-input px-3 py-2 outline-none focus:border-accent"
                    placeholder="Clear, practical, professional, and source-grounded."
                  />
                </label>

                <div className="flex justify-end gap-2 border-t border-line pt-4">
                  <button className="ui-button px-3 py-2" type="button" onClick={() => setMode(null)}>
                    Cancel
                  </button>
                  <button className="ui-primary-button px-4 py-2" type="submit">
                    Create client
                  </button>
                </div>
              </form>
            )}
          </section>
        </div>
      ) : null}
    </>
  );
}

function normalizeSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);
}
