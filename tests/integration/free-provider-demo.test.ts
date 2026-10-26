import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getPool } from "@/lib/db";
import { createDemoSession, getDemoState, sendDemoMessage } from "@/lib/customer-demo";
import { setupCustomerSimulator, prepareRealDemoEmbeddings } from "@/lib/customer-demo-setup";
import { DEMO_CLIENT_ID } from "@/lib/customer-demo-boundary";
import { FreeTierProvider } from "@/lib/llm/free-providers";
import { ProviderRequestError } from "@/lib/llm/errors";
import { deterministicEmbedding } from "@/lib/llm/mock";
import { processInboundJob } from "@/lib/channels/inbox-worker";
import { flushRetryableOutboundMessages } from "@/lib/channels/outbox";
import { retrieveKnowledge, retrieveKnowledgeText } from "@/lib/knowledge/retrieve";
import { getFilteredConversations } from "@/lib/reporting";
import { allowLoginAttempt } from "@/lib/login-throttle";
import { removePsCafeDemo, setupPsCafeDemo, PS_CAFE_DEMO_RESPONDER_ID } from "../../scripts/demo/ps-cafe-raffles-city";
import type { SessionUser } from "@/lib/auth";

const dbDescribe=process.env.PRONTO_RUN_DB_TESTS==="1"?describe:describe.skip;
const actor:SessionUser={userId:PS_CAFE_DEMO_RESPONDER_ID,clientId:DEMO_CLIENT_ID,role:"client",name:"Synthetic responder",email:"responder@ps-cafe-demo.test"};

dbDescribe("free-provider demo profiles with explicit fake inference and real isolated PostgreSQL",()=>{
  beforeEach(async()=>{
    vi.stubEnv("PRONTO_CUSTOMER_DEMO_ENABLED","1");
    for(const key of ["GEMINI_API_KEY","GROQ_API_KEY"])vi.stubEnv(key,"synthetic-not-live");
    for(const flag of ["PRONTO_DEMO_REAL_AI_APPROVED","PRONTO_GEMINI_FREE_TIER_CONFIRMED","PRONTO_GROQ_FREE_TIER_CONFIRMED"])vi.stubEnv(flag,"1");
    await removePsCafeDemo();await setupPsCafeDemo();await setupCustomerSimulator();
    vi.spyOn(FreeTierProvider.prototype,"embed").mockImplementation(async texts=>texts.map(text=>deterministicEmbedding(text)));
    vi.spyOn(FreeTierProvider.prototype,"generateGroundedAnswer").mockImplementation(async input=>({
      action:"answer",answer:"Synthetic provider fixture: standard close is 10:00pm daily.",confidence:0.99,
      reasonCode:"grounded_answer",reasonDetail:"Explicitly stubbed provider test, not genuine acceptance.",
      citedChunkIds:[input.retrievedChunks[0].id],actualModel:input.responseModel,providerResponseId:"fixture-response",
      usage:{inputTokens:100,outputTokens:20}}));
  });
  afterEach(async()=>{vi.restoreAllMocks();vi.unstubAllEnvs();await removePsCafeDemo();});
  afterAll(async()=>{await getPool().end();});

  it.each([['gemini-flash','gemini','gemini-3.8-flash'],['groq-oss','groq','openai/gpt-oss-20b'],['gemini-lite','gemini','gemini-3.5-flash-lite']])("%s pins selection through worker, attribution, grounding and both persisted views",async(choice,provider,model)=>{
    if(provider === "groq") {
      vi.stubEnv("GEMINI_API_KEY", "");vi.stubEnv("PRONTO_GEMINI_FREE_TIER_CONFIRMED","0");
    } else await prepareRealDemoEmbeddings("gemini");
    const session=await createDemoSession(actor,"real",choice);
    vi.stubEnv("PRONTO_LLM_PROVIDER","anthropic");vi.stubEnv("OPENAI_RESPONSE_MODEL","wrong-global-model");
    const job=await sendDemoMessage(actor,{sessionId:session.id,requestId:randomUUID(),text:"What time do you close today?"});
    expect(await processInboundJob({jobId:job.jobId})).toMatchObject({outcome:"answered"});await flushRetryableOutboundMessages();
    const state=await getDemoState(actor,session.id);
    expect(state.session?.ai_configuration).toMatchObject({provider,model,
      ...(provider === "groq" ? { embeddingProvider:"none",embeddingModel:"none",retrievalMode:"local_text" }
        : { embeddingProvider:"gemini",embeddingModel:"gemini-embedding-2" })});
    expect(state.messages[1]).toMatchObject({generation_mode:"real",response_provider:provider,response_model:model});
    const inbox=(await getFilteredConversations({clientId:DEMO_CLIENT_ID})).find(row=>row.id===session.conversationId);
    expect(inbox).toMatchObject({response_provider:provider,response_model:model,generation_mode:"real"});
    const trace=await getPool().query("select response_provider,embedding_provider,retrieval_chunk_count from agent_traces where conversation_id=$1",[session.conversationId]);
    expect(trace.rows[0]).toMatchObject({response_provider:provider,embedding_provider:provider === "groq" ? "none" : "gemini"});
    expect(trace.rows[0].retrieval_chunk_count).toBeGreaterThan(0);
    if(provider === "groq") {
      expect(FreeTierProvider.prototype.embed).not.toHaveBeenCalled();
      expect((await getPool().query("select operation from agent_usage_events where conversation_id=$1",[session.conversationId])).rows)
        .toEqual([{operation:"generation"}]);
      const metadata=(await getPool().query("select metadata from messages where conversation_id=$1 and sender_role='agent'",[session.conversationId])).rows[0].metadata;
      expect(metadata).toMatchObject({retrievalMode:"local_text",sourceProvenance:expect.arrayContaining([expect.objectContaining({sourceId:expect.any(String),contentHash:expect.any(String)})])});
    }
    expect(FreeTierProvider.prototype.generateGroundedAnswer).toHaveBeenCalledTimes(1);
  });
  it("preserves original vectors; excludes stale/archived Gemini vectors and cross-tenant lookups",async()=>{
    const before=await getPool().query("select id,embedding::text from knowledge_chunks where client_id=$1 order by id",[DEMO_CLIENT_ID]);
    await prepareRealDemoEmbeddings("gemini");
    expect((await getPool().query("select id,embedding::text from knowledge_chunks where client_id=$1 order by id",[DEMO_CLIENT_ID])).rows).toEqual(before.rows);
    const options={embeddingProvider:"gemini",embeddingModel:"gemini-embedding-2",queryText:"closing hours"};
    expect(await retrieveKnowledge(randomUUID(),deterministicEmbedding("closing hours"),5,options)).toEqual([]);
    expect(await retrieveKnowledge(DEMO_CLIENT_ID,deterministicEmbedding("closing hours"),5,options)).toHaveLength(3);
    await getPool().query("update knowledge_chunks set content=content||' Revised' where client_id=$1",[DEMO_CLIENT_ID]);
    expect(await retrieveKnowledge(DEMO_CLIENT_ID,deterministicEmbedding("closing hours"),5,options)).toEqual([]);
    await expect(createDemoSession(actor,"real","gemini-flash")).rejects.toThrow(/not prepared/);
    await prepareRealDemoEmbeddings("gemini");await getPool().query("update knowledge_sources set metadata=metadata||'{\"archived\":true}'::jsonb where client_id=$1",[DEMO_CLIENT_ID]);
    expect(await retrieveKnowledge(DEMO_CLIENT_ID,deterministicEmbedding("closing hours"),5,options)).toEqual([]);
  });
  it("does not switch providers or retry a quota failure",async()=>{
    vi.stubEnv("GEMINI_API_KEY","");const session=await createDemoSession(actor,"real","groq-oss");
    vi.mocked(FreeTierProvider.prototype.generateGroundedAnswer).mockRejectedValue(new ProviderRequestError("groq","quota_exhausted",429));
    const job=await sendDemoMessage(actor,{sessionId:session.id,requestId:randomUUID(),text:"What time do you close?"});
    expect(await processInboundJob({jobId:job.jobId})).toMatchObject({outcome:"escalated"});
    expect(await processInboundJob()).toBeNull();
    expect(await getDemoState(actor,session.id)).toMatchObject({providerError:true,providerFailureCode:"quota_exhausted"});
    expect(FreeTierProvider.prototype.generateGroundedAnswer).toHaveBeenCalledTimes(1);
  });
  it("rejects a cross-tenant chunk in the dedicated Gemini index at the database boundary",async()=>{
    const clientId=randomUUID(),sourceId=randomUUID(),chunkId=randomUUID();
    await getPool().query("insert into clients(id,name,slug,vertical,brand_voice) values($1,'Synthetic foreign tenant',$2,'test','Test')",[clientId,clientId]);
    try {
      await getPool().query("insert into knowledge_sources(id,client_id,title,source_type,content) values($1,$2,'Foreign fixture','curated_demo','Synthetic')",[sourceId,clientId]);
      await getPool().query(`insert into knowledge_chunks(id,source_id,client_id,chunk_index,content,token_estimate,embedding,embedding_model,embedding_dimensions)
        select $1,$2,$3,0,'Synthetic',2,embedding,embedding_model,embedding_dimensions from knowledge_chunks where client_id=$4 limit 1`,[chunkId,sourceId,clientId,DEMO_CLIENT_ID]);
      await expect(getPool().query(`insert into customer_demo_embeddings(chunk_id,client_id,profile,content_hash,embedding)
        select id,$2,'gemini-embedding-2:question-answering:1536:v1','synthetic',embedding from knowledge_chunks where id=$1`,[chunkId,DEMO_CLIENT_ID]))
        .rejects.toMatchObject({code:"23503"});
    } finally {await getPool().query("delete from clients where id=$1",[clientId]);}
  });
  it("rejects unallowlisted selections and missing keys; mock works without keys/real vectors",async()=>{
    await expect(createDemoSession(actor,"real","https://malicious.invalid/model")).rejects.toThrow(/supported/);
    await expect(createDemoSession(actor,"mock","gemini-flash")).rejects.toThrow(/matching/);
    vi.stubEnv("GEMINI_API_KEY","");vi.stubEnv("GROQ_API_KEY","");
    await expect(createDemoSession(actor,"real","gemini-flash")).rejects.toThrow(/GEMINI_API_KEY/);
    await expect(createDemoSession(actor,"real","groq-oss")).rejects.toThrow(/GROQ_API_KEY/);
    const session=await createDemoSession(actor,"mock");const job=await sendDemoMessage(actor,{sessionId:session.id,requestId:randomUUID(),text:"What time do you close?"});
    expect(await processInboundJob({jobId:job.jobId})).toMatchObject({outcome:"answered"});
    expect(FreeTierProvider.prototype.generateGroundedAnswer).not.toHaveBeenCalled();
  });
  it("local text retrieval excludes unknown, unreviewed, archived, conflicted and other-tenant knowledge",async()=>{
    expect(await retrieveKnowledgeText(DEMO_CLIENT_ID,"helicopter parking")).toEqual([]);
    expect(await retrieveKnowledgeText(randomUUID(),"hours OR close")).toEqual([]);
    const chunks=await retrieveKnowledgeText(DEMO_CLIENT_ID,"hours OR close");
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0].metadata).toMatchObject({retrievalMode:"local_text",approvalEvidence:"curated_public_demo_fact",sourceContentHash:expect.stringMatching(/^[0-9a-f]{64}$/)});
    expect(chunks.some(c=>String(c.metadata.sourceTitle).includes("reservations"))).toBe(false);
    await getPool().query("update knowledge_sources set metadata=metadata||'{\"archived\":true}'::jsonb where client_id=$1",[DEMO_CLIENT_ID]);
    expect(await retrieveKnowledgeText(DEMO_CLIENT_ID,"hours OR close")).toEqual([]);
    await getPool().query("update knowledge_sources set metadata=(metadata-'archived')||'{\"reviewStatus\":\"pending\"}'::jsonb where client_id=$1",[DEMO_CLIENT_ID]);
    expect(await retrieveKnowledgeText(DEMO_CLIENT_ID,"hours OR close")).toEqual([]);
  });
  it("Groq-only mode fails safely for missing answers and known conflicting policy without inference",async()=>{
    vi.stubEnv("GEMINI_API_KEY","");
    for(const text of ["Do you offer helicopter parking?","What is the weekend reservation cutoff?"]) {
      const session=await createDemoSession(actor,"real");
      const job=await sendDemoMessage(actor,{sessionId:session.id,requestId:randomUUID(),text});
      expect(await processInboundJob({jobId:job.jobId})).toMatchObject({outcome:"escalated"});
    }
    expect(FreeTierProvider.prototype.embed).not.toHaveBeenCalled();
    expect(FreeTierProvider.prototype.generateGroundedAnswer).not.toHaveBeenCalled();
  });
  it("Groq requires published local knowledge, not a prepared embedding index",async()=>{
    vi.stubEnv("GEMINI_API_KEY","");
    expect((await getDemoState(actor)).modelChoices.find(c=>c.id==="groq-oss")?.available).toBe(true);
    expect((await getDemoState(actor)).modelChoices.find(c=>c.id==="gemini-flash")?.available).toBe(false);
    await getPool().query("delete from knowledge_chunks where client_id=$1",[DEMO_CLIENT_ID]);
    await expect(createDemoSession(actor,"real")).rejects.toThrow(/approved published/);
  });
  it("enforces account login limits atomically across concurrent requests without storing addresses",async()=>{
    vi.stubEnv("PRONTO_LOGIN_THROTTLE","1");const email=`${randomUUID()}@example.test`;
    const now=new Date("2026-01-01T00:00:00Z");
    try {
      const results=await Promise.all(Array.from({length:12},()=>allowLoginAttempt(email,now)));
      expect(results.filter(Boolean)).toHaveLength(8);
      const stored=await getPool().query("select key from auth_login_attempts where window_start=$1",[now]);
      expect(stored.rows).toHaveLength(2);expect(JSON.stringify(stored.rows)).not.toContain(email);
    } finally {await getPool().query("delete from auth_login_attempts where window_start=$1",[now]);}
  });
});
