import { createChopeBrowserConnector } from "../src/lib/reservations/chope-browser";

// Explicitly opt in to a single read-only provider lookup. This script never books.
if (process.env.CHOPE_LIVE_READ_APPROVED !== "1" || process.env.PRONTO_CHOPE_LIVE_READS !== "1") {
  throw new Error("Set CHOPE_LIVE_READ_APPROVED=1 and PRONTO_CHOPE_LIVE_READS=1 for an authorized live read.");
}

const [clientId, outletId, listingUrl, date, time, partyText] = process.argv.slice(2);
if (!clientId || !outletId || !listingUrl || !date || !time || !partyText) {
  throw new Error("Usage: chope-live-read <client-id> <outlet-id> <listing-url> <YYYY-MM-DD> <HH:mm> <party-size>");
}

const connector = createChopeBrowserConnector({ clientId, outletId, listingUrl,
  authorizedAt: new Date().toISOString(), scope: "demo_availability" });
const result = await connector.getAvailability({ clientId, outletId, date, time,
  partySize: Number(partyText) });
console.log(JSON.stringify(result, null, 2));
if (result.status === "error") process.exitCode = 1;
