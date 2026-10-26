import { afterEach, expect, it, vi } from "vitest";
import { databaseConnectionOptions } from "@/lib/db";
afterEach(()=>vi.unstubAllEnvs());
it("uses bounded small pools for Vercel while retaining the ordinary worker default",()=>{
  vi.stubEnv("VERCEL","1");vi.stubEnv("PRONTO_DB_POOL_MAX","");
  expect(databaseConnectionOptions()).toMatchObject({max:2,min:0,idleTimeoutMillis:5000});
  vi.stubEnv("PRONTO_DB_POOL_MAX","4");expect(databaseConnectionOptions().max).toBe(4);
  vi.stubEnv("PRONTO_DB_POOL_MAX","10000");expect(databaseConnectionOptions().max).toBe(2);
  vi.stubEnv("VERCEL","0");vi.stubEnv("PRONTO_DB_POOL_MAX","");expect(databaseConnectionOptions().max).toBe(10);
});
it("enforces certificate verification rather than allowing URL ssl settings to override it",()=>{
  vi.stubEnv("PRONTO_DEPLOYMENT_PROFILE","protected-demo");
  vi.stubEnv("DATABASE_URL","postgresql://demo:synthetic@database.invalid/pronto_demo?sslmode=require");
  const config=databaseConnectionOptions();expect(config.ssl).toEqual({rejectUnauthorized:true});
  expect(config.connectionString).not.toContain("sslmode");
  vi.stubEnv("DATABASE_URL","postgresql://demo:synthetic@database.invalid/pronto_demo?sslmode=no-verify");
  expect(()=>databaseConnectionOptions()).toThrow(/cannot be disabled/);
});
