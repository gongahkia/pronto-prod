"use client";

import { useEffect, useState } from "react";

const checkedClicks = new WeakSet<Event>();

// Small POC safeguard: native reload warning, navigation confirmation and a save version.
export function useDraftEditor<T>(initialValue: T, initialVersion: number) {
  const incoming = JSON.stringify(initialValue);
  const [state, setState] = useState({ value: initialValue, baseline: incoming, version: initialVersion,
    serverValue: incoming, serverVersion: initialVersion });
  const dirty = JSON.stringify(state.value) !== state.baseline;
  if (state.serverValue !== incoming || state.serverVersion !== initialVersion) {
    setState({ ...state, serverValue: incoming, serverVersion: initialVersion,
      ...(!dirty ? { value: initialValue, baseline: incoming, version: initialVersion }
        : state.baseline === incoming ? { version: initialVersion } : {}) });
  }
  useEffect(() => {
    if (!dirty) return;
    const unload = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    const navigate = (event: MouseEvent) => {
      if (event.defaultPrevented || checkedClicks.has(event) || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!(anchor instanceof HTMLAnchorElement) || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      const destination = new URL(anchor.href);
      if (destination.pathname === location.pathname && destination.search === location.search) return;
      checkedClicks.add(event);
      if (!window.confirm("Leave this page and discard your unsaved edits?")) { event.preventDefault(); event.stopPropagation(); }
    };
    window.addEventListener("beforeunload", unload);
    document.addEventListener("click", navigate, true);
    return () => { window.removeEventListener("beforeunload", unload); document.removeEventListener("click", navigate, true); };
  }, [dirty]);
  return { value: state.value, dirty, version: state.version,
    setValue: (next: T | ((value: T) => T)) => setState(current => ({ ...current, value: typeof next === "function" ? (next as (value: T) => T)(current.value) : next })),
    saved: (version: number) => setState(current => ({ ...current, baseline: JSON.stringify(current.value), version })),
    reset: () => setState({ value: initialValue, baseline: incoming, version: initialVersion, serverValue: incoming, serverVersion: initialVersion }) };
}
