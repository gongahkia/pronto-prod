import { query, type Queryable } from "@/lib/db";
import type { Channel } from "@/lib/types";
import { protectedDemoConfiguration, protectedDemoDeployment } from "@/lib/deployment-profile";

export const DEMO_CLIENT_ID = "00000000-0000-4000-8000-00000000a101";
export const DEMO_CHANNEL_ID = "00000000-0000-4000-8000-00000000a106";
export const DEMO_SLUG = "ps-cafe-raffles-city-demo";

export class DemoError extends Error {
  constructor(message: string, public readonly status = 400) { super(message); }
}

export async function assertCustomerDemoEnabled(db: Queryable = { query }): Promise<void> {
  if (protectedDemoDeployment()) {
    let settings: ReturnType<typeof protectedDemoConfiguration>;
    try { settings = protectedDemoConfiguration(); }
    catch { throw new DemoError("The protected customer demo is not safely configured.", 503); }
    const identity = await db.query<{ safe: boolean }>(`select
      shobj_description(oid,'pg_database')=$1 as safe from pg_database where datname=current_database()`, [settings.marker]);
    if (!identity.rows[0]?.safe) throw new DemoError("Protected demo database identity verification failed.", 503);
    return;
  }
  if (process.env.PRONTO_CUSTOMER_DEMO_ENABLED !== "1" || process.env.NODE_ENV === "production")
    throw new DemoError("The authenticated local customer simulator is disabled.", 404);
  try {
    const url = new URL(process.env.DATABASE_URL ?? "");
    if (process.env.DATABASE_URL !== process.env.PRONTO_TEST_DATABASE_URL ||
        !["127.0.0.1", "localhost", "::1"].includes(url.hostname) ||
        url.pathname !== "/pronto_test" || !url.port) throw new Error();
  } catch { throw new DemoError("Customer simulation requires the verified local test database.", 503); }
  const result = await db.query<{ safe: boolean }>(`select current_database()='pronto_test'
    and inet_server_addr() in ('127.0.0.1'::inet, '::1'::inet)
    and shobj_description(oid, 'pg_database')='pronto:isolated-test-database:v1' as safe
    from pg_database where datname=current_database()`);
  if (!result.rows[0]?.safe) throw new DemoError("Local database identity verification failed.", 503);
}

export function isCustomerDemoChannel(channel: Pick<Channel, "id" | "client_id" | "kind" | "settings">): boolean {
  return channel.id === DEMO_CHANNEL_ID && channel.client_id === DEMO_CLIENT_ID &&
    channel.kind === "console" && channel.settings.transport === "customer_simulator";
}

// Knowledge authoring shares the same verified synthetic boundary as chat.
// Missing provider keys never select this mode for an ordinary business.
export async function usesDemoTextKnowledge(clientId: string): Promise<boolean> {
  if (clientId !== DEMO_CLIENT_ID ||
      (!protectedDemoDeployment() && process.env.PRONTO_CUSTOMER_DEMO_ENABLED !== "1")) return false;
  await assertCustomerDemoEnabled();
  const identity = await query<{ safe: boolean }>(`select exists(select 1 from clients
    where id = $1 and slug = $2 and business_profile->>'demoSeed' = 'ps-cafe-raffles-city-v1') as safe`,
  [DEMO_CLIENT_ID, DEMO_SLUG]);
  if (!identity.rows[0]?.safe) throw new DemoError("Synthetic knowledge tenant identity verification failed.", 503);
  return true;
}
