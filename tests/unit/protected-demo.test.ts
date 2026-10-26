import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/db",()=>({query:vi.fn()}));
import { query } from "@/lib/db";
import { protectedDemoConfiguration } from "@/lib/deployment-profile";
import { assertCustomerDemoEnabled } from "@/lib/customer-demo-boundary";
import { allowLoginAttempt } from "@/lib/login-throttle";

const id="00000000-0000-4000-8000-00000000d001";
function configure(){
  const env={NODE_ENV:"production",PRONTO_DEPLOYMENT_PROFILE:"protected-demo",PRONTO_CUSTOMER_DEMO_ENABLED:"1",PRONTO_DEMO_ONLY_DELIVERY:"1",
    PRONTO_CHOPE_LIVE_READS:"0",CHOPE_LIVE_READ_APPROVED:"0",PRONTO_DISABLE_TENANT_SQL_GATE:"0",PRONTO_TEST_DATABASE_URL:"",
    PRONTO_DEMO_DATABASE_ID:id,PRONTO_DEMO_ALLOWED_USER_IDS:id,DATABASE_URL:"postgresql://demo:synthetic@database.invalid/pronto_demo?sslmode=verify-full",
    APP_BASE_URL:"https://demo.example.test",AUTH_SECRET:"synthetic-test-auth-0123456789-abcdefgh",PRONTO_SECRETS_KEY:"synthetic-test-encrypt-0123456789-abcdef"};
  for(const[k,v]of Object.entries(env))vi.stubEnv(k,v);
}
beforeEach(()=>{vi.resetAllMocks();configure();});afterEach(()=>vi.unstubAllEnvs());
describe("protected hosted demo identity",()=>{
  it("requires its separate exact marker without relaxing the test verifier",async()=>{
    vi.mocked(query).mockResolvedValue({rows:[{safe:true}]} as never);await expect(assertCustomerDemoEnabled()).resolves.toBeUndefined();
    expect(vi.mocked(query).mock.calls[0][1]).toEqual([`pronto:protected-demo:v1:${id}`]);
    vi.mocked(query).mockResolvedValue({rows:[{safe:false}]} as never);await expect(assertCustomerDemoEnabled()).rejects.toThrow(/identity/);
  });
  it.each([
    ["PRONTO_DEPLOYMENT_PROFILE",""],["NODE_ENV","development"],["PRONTO_DEMO_ONLY_DELIVERY","0"],
    ["PRONTO_CHOPE_LIVE_READS","1"],["CHOPE_LIVE_READ_APPROVED","1"],["PRONTO_DISABLE_TENANT_SQL_GATE","1"],
    ["PRONTO_DEMO_DATABASE_ID","not-a-uuid"],["PRONTO_DEMO_ALLOWED_USER_IDS",""],["PRONTO_TEST_DATABASE_URL","postgresql://loopback/pronto_test"],
    ["DATABASE_URL","postgresql://demo:synthetic@database.invalid/pronto_test"],
    ["DATABASE_URL","postgresql://demo:synthetic@database.invalid/pronto_demo?sslmode=disable"],
    ["APP_BASE_URL","http://demo.example.test"],["AUTH_SECRET","weak"],
  ])("fails closed for unsafe %s",(key,value)=>{vi.stubEnv(key,value);expect(()=>protectedDemoConfiguration()).toThrow(/configuration/);});
  it("ordinary production still refuses customer injection",async()=>{
    vi.stubEnv("PRONTO_DEPLOYMENT_PROFILE","");await expect(assertCustomerDemoEnabled()).rejects.toMatchObject({status:404});
  });
  it("stores hashed login keys and enforces persistent limits",async()=>{
    vi.mocked(query).mockResolvedValue({rows:[{attempts:1}]} as never);
    expect(await allowLoginAttempt("Person@Example.test",new Date("2026-10-25T12:01:00Z"))).toBe(true);
    const calls=vi.mocked(query).mock.calls;expect(JSON.stringify(calls)).not.toContain("Person@Example.test");
    expect(calls[2][1]?.[0]).toMatch(/^[0-9a-f]{64}$/);
    vi.mocked(query).mockResolvedValue({rows:[{attempts:121}]} as never);expect(await allowLoginAttempt("person@example.test")).toBe(false);
  });
});
