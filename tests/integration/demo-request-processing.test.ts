import {randomUUID} from 'node:crypto';
import {afterAll,afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {getPool} from '@/lib/db';
import * as deployment from '@/lib/deployment-profile';
import {processDemoQueue} from '@/lib/demo-processing';
import {createDemoSession,sendDemoMessage,getDemoState,retryDemoProcessing} from '@/lib/customer-demo';
import {setupCustomerSimulator} from '@/lib/customer-demo-setup';
import {DEMO_CLIENT_ID} from '@/lib/customer-demo-boundary';
import {processInboundJob} from '@/lib/channels/inbox-worker';
import {updateConversationAction} from '@/lib/conversation-actions';
import {removePsCafeDemo,setupPsCafeDemo,PS_CAFE_DEMO_RESPONDER_ID} from '../../scripts/demo/ps-cafe-raffles-city';
import type {SessionUser} from '@/lib/auth';
const dbDescribe=process.env.PRONTO_RUN_DB_TESTS==='1'?describe:describe.skip;
const actor:SessionUser={userId:PS_CAFE_DEMO_RESPONDER_ID,role:'client',clientId:DEMO_CLIENT_ID,name:'QA',email:'qa@demo.test'};
dbDescribe('durable request processing against an isolated database',()=>{
 beforeEach(async()=>{
  vi.stubEnv('PRONTO_CUSTOMER_DEMO_ENABLED','1');await removePsCafeDemo();await setupPsCafeDemo();await setupCustomerSimulator();
  // Exercise the processor in the marked isolated test DB. This bypass does
  // not run in app code; the hosted production profile is accepted separately.
  vi.spyOn(deployment,'requestDrivenDemoProcessing').mockReturnValue(true);
  vi.spyOn(deployment,'protectedDemoConfiguration').mockReturnValue({databaseId:randomUUID(),marker:'test-only',allowedUserIds:[actor.userId],database:new URL(process.env.DATABASE_URL!),origin:new URL('https://demo.invalid')});
 });
 afterEach(async()=>{vi.restoreAllMocks();vi.unstubAllEnvs();await removePsCafeDemo();});
 afterAll(async()=>{await getPool().end();});
 async function enqueue(){const session=await createDemoSession(actor,'mock');const requestId=randomUUID();const job=await sendDemoMessage(actor,{sessionId:session.id,requestId,text:'What time do you close today?'});return {session,job,requestId};}
 it('handles duplicate enqueue and overlapping browser requests with one visible reply',async()=>{
  const {session,job,requestId}=await enqueue();expect((await sendDemoMessage(actor,{sessionId:session.id,requestId,text:'What time do you close today?'})).jobId).toBe(job.jobId);
  await Promise.all([processDemoQueue(actor),processDemoQueue(actor)]);await processDemoQueue(actor);
  const state=await getDemoState(actor,session.id);expect(state.messages.filter(m=>m.sender==='business')).toHaveLength(1);
  expect((await getPool().query('select count(*)::int count from outbound_messages where client_id=$1',[DEMO_CLIENT_ID])).rows[0].count).toBe(1);
 });
 it('reclaims a stopped inbound lease and reuses a persisted answer after another restart',async()=>{
  const {session,job}=await enqueue();await getPool().query("update inbound_jobs set status='processing',attempt_count=1,lease_expires_at=now()-interval '1 second' where id=$1",[job.jobId]);
  expect(await processDemoQueue(actor)).toMatchObject({processed:1,delivered:1});
  await getPool().query("update inbound_jobs set status='processing',lease_expires_at=now()-interval '1 second' where id=$1",[job.jobId]);
  await getPool().query("update outbound_messages set status='sending',updated_at=now()-interval '3 minutes' where client_id=$1 and conversation_id=$2",[DEMO_CLIENT_ID,session.conversationId]);
  await processDemoQueue(actor);
  const state=await getDemoState(actor,session.id);expect(state.messages.filter(m=>m.sender==='business')).toHaveLength(1);
  expect((await getPool().query("select count(*)::int count from messages where client_id=$1 and conversation_id=$2 and sender_role='agent'",[DEMO_CLIENT_ID,session.conversationId])).rows[0].count).toBe(1);
 });
 it('preserves live leases, surfaces exhausted work and retries stopped jobs/delivery within existing limits',async()=>{
  const {session,job}=await enqueue();await getPool().query("update inbound_jobs set status='processing',attempt_count=1,lease_expires_at=now()+interval '1 minute' where id=$1",[job.jobId]);
  expect(await processDemoQueue(actor)).toMatchObject({processed:0});
  await getPool().query("update inbound_jobs set attempt_count=5,lease_expires_at=now()-interval '1 second' where id=$1",[job.jobId]);await processDemoQueue(actor);
  expect((await getDemoState(actor,session.id)).job).toMatchObject({status:'dead'});await retryDemoProcessing(actor,session.id);await processDemoQueue(actor);
  await getPool().query("update outbound_messages set status='dead',attempt_count=5 where client_id=$1 and conversation_id=$2",[DEMO_CLIENT_ID,session.conversationId]);
  expect((await getDemoState(actor,session.id)).job).toMatchObject({delivery_status:'dead'});await retryDemoProcessing(actor,session.id);
  expect(await processDemoQueue(actor)).toMatchObject({processed:0,delivered:1});
 });
 it('preserves human takeover when a generated reply was queued before the interruption',async()=>{
  const {session,job}=await enqueue();await processInboundJob({jobId:job.jobId});
  await updateConversationAction({actor,clientId:DEMO_CLIENT_ID,conversationId:session.conversationId,action:'takeover'});await processDemoQueue(actor);
  expect((await getDemoState(actor,session.id)).messages.every(m=>m.sender==='customer')).toBe(true);
  expect((await getPool().query('select status from outbound_messages where client_id=$1 and conversation_id=$2',[DEMO_CLIENT_ID,session.conversationId])).rows).toEqual([{status:'suppressed'}]);
 });
 it('never sweeps another transport while recovering synthetic sends',async()=>{
  const {session}=await enqueue();const channel=randomUUID();await getPool().query("insert into channels(id,client_id,kind,name,status) values($1,$2,'instagram','Never send','active')",[channel,DEMO_CLIENT_ID]);
  await getPool().query(`insert into outbound_messages(client_id,conversation_id,channel_id,external_thread_id,body,idempotency_key,status,updated_at)
   values($1,$2,$3,'unreachable','Never send','foreign-transport-qa','sending',now()-interval '5 minutes')`,[DEMO_CLIENT_ID,session.conversationId,channel]);
  await processDemoQueue(actor);expect((await getPool().query('select status from outbound_messages where channel_id=$1',[channel])).rows).toEqual([{status:'sending'}]);
 });
});
