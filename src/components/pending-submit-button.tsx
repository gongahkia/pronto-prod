"use client";

import { useFormStatus } from "react-dom";

export function PendingSubmitButton({
  children,
  pendingText,
  className,
}: {
  children: React.ReactNode;
  pendingText?: string;
  className: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button className={className} type="submit" disabled={pending} aria-disabled={pending}>
      {pending ? pendingText ?? "Saving..." : children}
    </button>
  );
}

