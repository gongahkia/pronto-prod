import type { ReactNode } from "react";

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "green" | "red" | "amber";
}) {
  const tones = {
    neutral: "border-line bg-surface text-muted",
    green: "border-success/25 bg-success-bg text-success",
    red: "border-danger/25 bg-danger-bg text-danger",
    amber: "border-warning/25 bg-warning-bg text-warning",
  };

  return (
    <span className={`inline-flex items-center rounded-[5px] border px-1.5 py-0.5 text-[11px] font-medium leading-4 ${tones[tone]}`}>
      {children}
    </span>
  );
}
