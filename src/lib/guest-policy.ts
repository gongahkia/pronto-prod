import { protectedDemoDeployment } from "@/lib/deployment-profile";

// Guest reviewers exist on any demo deployment (the same switch the demo itself already needs) and never on an
// ordinary deployment, where /enter returns 404 and no guest can be created.
export const GUEST_EMAIL_DOMAIN = "guest.invalid";
export const isGuestEmail = (email: string) => email.toLowerCase().endsWith(`@${GUEST_EMAIL_DOMAIN}`);

export function guestAccessEnabled(): boolean {
  return protectedDemoDeployment() || process.env.PRONTO_CUSTOMER_DEMO_ENABLED === "1";
}
