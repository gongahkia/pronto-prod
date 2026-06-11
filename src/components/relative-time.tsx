"use client";

import { useEffect, useState } from "react";

export function RelativeTime({ value }: { value: Date | string }) {
  const date = value instanceof Date ? value : new Date(value);
  const now = useNow(60_000);
  return (
    <time dateTime={date.toISOString()} title={date.toLocaleString("en-SG")}>
      {formatRelativeTime(date, now)}
    </time>
  );
}

function useNow(intervalMs: number): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);
  return now;
}

function formatRelativeTime(date: Date, now: Date): string {
  const diffSeconds = Math.round((date.getTime() - now.getTime()) / 1000);
  const abs = Math.abs(diffSeconds);
  const divisions = [
    { amount: 60, unit: "second" },
    { amount: 60, unit: "minute" },
    { amount: 24, unit: "hour" },
    { amount: 7, unit: "day" },
    { amount: 4.345, unit: "week" },
    { amount: 12, unit: "month" },
    { amount: Number.POSITIVE_INFINITY, unit: "year" },
  ] as const;
  let value = diffSeconds;
  let unit: Intl.RelativeTimeFormatUnit = "second";
  for (const division of divisions) {
    if (Math.abs(value) < division.amount) {
      unit = division.unit;
      break;
    }
    value /= division.amount;
  }
  if (abs < 5) return "now";
  return new Intl.RelativeTimeFormat("en-SG", { numeric: "auto" }).format(
    Math.round(value),
    unit,
  );
}

