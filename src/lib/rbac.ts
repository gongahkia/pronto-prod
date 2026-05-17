import type { SessionUser } from "@/lib/auth";

export function canAccessClient(user: SessionUser, clientId: string): boolean {
  if (user.role === "operator") {
    return true;
  }
  return Boolean(user.clientId && user.clientId === clientId);
}

export function canUseOperatorRoutes(user: SessionUser): boolean {
  return user.role === "operator";
}

export function clientAccessError(
  user: SessionUser,
  clientId: string,
): string | null {
  return canAccessClient(user, clientId)
    ? null
    : `User ${user.email} cannot access client ${clientId}.`;
}
