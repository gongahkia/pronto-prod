import { appBaseUrl } from "@/lib/env";

// Reverse proxies can expose an internal request URL. Pin production redirects
// to the configured public origin, without trusting forwarded request headers.
export function publicAppUrl(path: string, requestUrl: string): URL {
  if (process.env.NODE_ENV !== "production") return new URL(path, requestUrl);
  const origin = new URL(appBaseUrl());
  if (origin.protocol !== "https:" || origin.username || origin.password ||
      origin.pathname !== "/" || origin.search || origin.hash) {
    throw new Error("Application redirects require a configured public HTTPS origin.");
  }
  const destination = new URL(path, origin);
  if (destination.origin !== origin.origin) throw new Error("Invalid application destination.");
  return destination;
}
