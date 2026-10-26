import {describe,expect,it} from 'vitest';
import {analyticsWindow} from '@/lib/analytics/data';
import {validateSynthesis} from '@/lib/analytics/schema';
import type {AnalyticsConversation,Synthesis} from '@/lib/analytics/types';
const c1='00000000-0000-4000-8000-000000001111',c2='00000000-0000-4000-8000-000000002222';
const m1='00000000-0000-4000-8000-000000003333',m2='00000000-0000-4000-8000-000000004444';
const sample:AnalyticsConversation[]=[{id:c1,customer:'A',channel:'console',status:'active',needsTeam:false,assistantCompleted:true,updatedAt:'2026-10-26',messages:[{id:m1,role:'customer',body:'When are you open?'}]},
 {id:c2,customer:'B',channel:'email',status:'escalated',needsTeam:true,assistantCompleted:false,updatedAt:'2026-10-26',messages:[{id:m2,role:'customer',body:'Please help with my receipt.'}]}];
const valid=():Synthesis=>({summary:'Two different enquiries.',topics:[{id:'hours',name:'Opening hours',description:'Hours enquiry',conversationIds:[c1]},{id:'orders',name:'Order help',description:'Order enquiry',conversationIds:[c2]}],
 conversations:[{id:c1,topicId:'hours',sentiment:'neutral',summary:'Asked for hours.',evidenceMessageIds:[m1]},{id:c2,topicId:'orders',sentiment:'unclear',summary:'Asked for order help.',evidenceMessageIds:[m2]}],recommendations:[],knowledgeGaps:[]});
describe('evidence-backed synthesis',()=>{
 it('accepts complete classifications and valid evidence without manufacturing counts',()=>expect(validateSynthesis(valid(),sample)).toEqual(valid()));
 it('rejects invented or cross-conversation evidence and recommendations',()=>{
  const cross=valid();cross.conversations[0].evidenceMessageIds=[m2];expect(()=>validateSynthesis(cross,sample)).toThrow('Evidence');
  const unknown=valid();unknown.recommendations=[{title:'Check',detail:'Review this.',priority:'high',conversationIds:['00000000-0000-4000-8000-000000009999']}];expect(()=>validateSynthesis(unknown,sample)).toThrow('unknown conversation');
 });
 it('rejects missing, duplicate and inconsistent topic assignments',()=>{
  const missing=valid();missing.conversations.pop();expect(()=>validateSynthesis(missing,sample)).toThrow('exactly once');
  const duplicate=valid();duplicate.topics[0].conversationIds.push(c2);expect(()=>validateSynthesis(duplicate,sample)).toThrow();
  const inconsistent=valid();inconsistent.conversations[0].topicId='orders';expect(()=>validateSynthesis(inconsistent,sample)).toThrow('membership');
 });
 it('uses stable calendar windows and validates the period',()=>{
  expect(analyticsWindow('7',new Date('2026-10-26T10:00:00Z'))).toEqual({days:7,from:'2026-10-20T00:00:00.000Z',until:'2026-10-27T00:00:00.000Z'});
  expect(()=>analyticsWindow('999')).toThrow();
 });
});
