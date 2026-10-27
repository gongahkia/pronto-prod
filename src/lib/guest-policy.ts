import { protectedDemoDeployment } from "@/lib/deployment-profile";

// Pure rules (no database) shared by the request proxy, the guest routes and the demo actor check.
export const GUEST_EMAIL_DOMAIN = "guest.invalid";
export const isGuestEmail = (email: string) => email.toLowerCase().endsWith(`@${GUEST_EMAIL_DOMAIN}`);

// Off unless explicitly enabled, and only ever for the synthetic demo deployment.
export function guestAccessEnabled(): boolean {
  return process.env.PRONTO_DEMO_GUEST_ACCESS === "1" &&
    (protectedDemoDeployment() || process.env.PRONTO_CUSTOMER_DEMO_ENABLED === "1");
}
// Chatting with the simulator spends LLM credit, so it is a separate switch.
export function guestSimulatorEnabled(): boolean {
  return guestAccessEnabled() && process.env.PRONTO_DEMO_GUEST_SIMULATOR === "1";
}

const READ_ONLY = new Set(["GET", "HEAD", "OPTIONS"]);
const ALWAYS = new Set(["/api/demo/feedback", "/api/auth/logout", "/api/auth/login"]);
const SIMULATOR = new Set(["/api/demo/customer", "/api/demo/process"]);

// A guest can read the demo and leave feedback. Every other write is refused at the edge, whatever the route does.
export function guestMayRequest(method: string, pathname: string): boolean {
  if (READ_ONLY.has(method.toUpperCase())) return true;
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  return ALWAYS.has(path) || (SIMULATOR.has(path) && guestSimulatorEnabled());
}
