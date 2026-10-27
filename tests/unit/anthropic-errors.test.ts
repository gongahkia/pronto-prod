// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { AnthropicProvider } from "@/lib/llm/anthropic";
import { withAiExecutionProfile } from "@/lib/llm/execution-mode";
import { getGenerationProvider } from "@/lib/llm";
const input={clientName:"Synthetic cafe",brandVoice:"Clear",promptPreamble:"Approved facts only.",customerMessage:"Hi",recentMessages:[],retrievedChunks:[],responseModel:"synthetic-model"};
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();});
describe("Anthropic operational errors",()=>{
 it.each([[401,"authentication"],[429,"rate_limited"],[503,"unavailable"]])("retains HTTP %s and safe retry hints without payloads",async(status,code)=>{
  vi.stubEnv("ANTHROPIC_API_KEY","fixture-no-live-requests");
  vi.stubGlobal("fetch",vi.fn(async()=>new Response("SECRET PROVIDER PAYLOAD",{status:Number(status),headers:{"retry-after":"30"}})));
  const error=await withAiExecutionProfile({mode:"real"},()=>new AnthropicProvider().generateGroundedAnswer(input)).catch(error=>error);
  expect(error).toMatchObject({code,retryAfterSeconds:30});expect(error.message).not.toContain("SECRET");
 });
 it("stops malformed successful responses as invalid responses",async()=>{
  vi.stubEnv("ANTHROPIC_API_KEY","fixture-no-live-requests");
  vi.stubGlobal("fetch",vi.fn(async()=>new Response(JSON.stringify({content:[{type:"text",text:"not json"}]}))));
  await expect(withAiExecutionProfile({mode:"real"},()=>getGenerationProvider("anthropic").generateGroundedAnswer(input))).rejects.toMatchObject({code:"invalid_response",retryable:false});
 });
});
