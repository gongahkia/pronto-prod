import { AsyncLocalStorage } from "node:async_hooks";

export type TenantContextUser = {
  role: "operator" | "client";
  clientId: string | null;
};

const storage = new AsyncLocalStorage<TenantContextUser>();

export function enterTenantContext(user: TenantContextUser): void {
  storage.enterWith(user);
}

export function getTenantContext(): TenantContextUser | undefined {
  return storage.getStore();
}

