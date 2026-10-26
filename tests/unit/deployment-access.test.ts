import {afterEach,expect,it,vi} from "vitest";
import {deploymentAccessHeaders} from "@/lib/deployment-access";
afterEach(()=>vi.unstubAllEnvs());
it("needs no platform token for the existing CLI workflow",()=>{
  vi.stubEnv("PRONTO_VERCEL_PROTECTION_BYPASS","");vi.stubEnv("PRONTO_VERCEL_PROTECTION_ORIGIN","");expect(deploymentAccessHeaders("http://localhost:3000")).toEqual({});
});
it("pins an optional platform token to one HTTPS origin",()=>{
  vi.stubEnv("PRONTO_VERCEL_PROTECTION_BYPASS","synthetic-private-token");vi.stubEnv("PRONTO_VERCEL_PROTECTION_ORIGIN","https://demo.example.test");
  expect(deploymentAccessHeaders("https://demo.example.test")).toEqual({"x-vercel-protection-bypass":"synthetic-private-token"});
  for(const origin of ["https://attacker.invalid","http://demo.example.test","http://localhost:3000"])expect(()=>deploymentAccessHeaders(origin)).toThrow(/unpinned/);
});
it("rejects malformed or missing token-origin pairs without exposing their values",()=>{
  vi.stubEnv("PRONTO_VERCEL_PROTECTION_BYPASS","synthetic-private-token");vi.stubEnv("PRONTO_VERCEL_PROTECTION_ORIGIN","");
  expect(()=>deploymentAccessHeaders("https://demo.example.test")).toThrow(/pinned HTTPS/);
  vi.stubEnv("PRONTO_VERCEL_PROTECTION_ORIGIN","https://demo.example.test/untrusted-path");
  expect(()=>deploymentAccessHeaders("https://demo.example.test")).toThrow(/unpinned/);
});
