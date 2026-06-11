const DEFAULT_LOCALE = process.env.PRONTO_LOCALE ?? "en-SG";
const DEFAULT_TIME_ZONE = process.env.PRONTO_TIME_ZONE ?? "UTC";

export function formatDate(value: Date | string | null | undefined): string {
  const date = coerceDate(value);
  if (!date) return "Pending";
  return new Intl.DateTimeFormat(DEFAULT_LOCALE, {
    dateStyle: "medium",
    timeZone: DEFAULT_TIME_ZONE,
  }).format(date);
}

export function formatDateTime(value: Date | string | null | undefined): string {
  const date = coerceDate(value);
  if (!date) return "Pending";
  return new Intl.DateTimeFormat(DEFAULT_LOCALE, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: DEFAULT_TIME_ZONE,
  }).format(date);
}

export function isoDate(value: Date | string): string {
  return coerceDate(value)?.toISOString().slice(0, 10) ?? "";
}

function coerceDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
