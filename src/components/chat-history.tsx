"use client";

import { useEffect, useRef, type ReactNode } from "react";

export function ChatHistory({ children, lastMessageId }: { children: ReactNode; lastMessageId?: string }) {
  const container = useRef<HTMLDivElement>(null);
  const followLatest = useRef(true);

  useEffect(() => {
    if (container.current && followLatest.current) {
      container.current.scrollTop = container.current.scrollHeight;
    }
  }, [lastMessageId]);

  return <div ref={container} className="max-h-[36rem] min-h-[28rem] overflow-y-auto p-4 sm:p-5"
    onScroll={event => {
      const element = event.currentTarget;
      followLatest.current = element.scrollHeight - element.scrollTop - element.clientHeight < 80;
    }}>
    {children}
  </div>;
}
