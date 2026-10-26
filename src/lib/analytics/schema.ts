import {z} from 'zod';
import type {AnalyticsConversation,Synthesis} from './types';
const ids=z.array(z.string().uuid()).min(1).max(40);
export const synthesisSchema=z.object({
 summary:z.string().min(1).max(1400),
 topics:z.array(z.object({id:z.string().min(1).max(60),name:z.string().min(1).max(70),description:z.string().max(250),conversationIds:ids}).strict()).min(1).max(10),
 conversations:z.array(z.object({id:z.string().uuid(),topicId:z.string().max(60),sentiment:z.enum(['positive','neutral','negative','mixed','unclear']),summary:z.string().min(1).max(350),evidenceMessageIds:z.array(z.string().uuid()).min(1).max(6)}).strict()).min(1).max(40),
 recommendations:z.array(z.object({title:z.string().min(1).max(100),detail:z.string().min(1).max(450),priority:z.enum(['high','medium','low']),conversationIds:ids}).strict()).max(5),
 knowledgeGaps:z.array(z.object({question:z.string().min(1).max(350),conversationIds:ids}).strict()).max(5),
}).strict();
export const synthesisJsonSchema=z.toJSONSchema(synthesisSchema,{target:'draft-7'});
export function validateSynthesis(value:unknown,sample:AnalyticsConversation[]):Synthesis {
 const parsed=synthesisSchema.parse(value);const byId=new Map(sample.map(c=>[c.id,c]));
 const known=(id:string)=>{if(!byId.has(id))throw new Error('The synthesis cited an unknown conversation.');};
 if(parsed.conversations.length!==sample.length||new Set(parsed.conversations.map(c=>c.id)).size!==sample.length)throw new Error('The synthesis must classify every sampled conversation exactly once.');
 const topicIds=new Set(parsed.topics.map(t=>t.id));if(topicIds.size!==parsed.topics.length)throw new Error('Topic IDs must be unique.');
 const assigned=new Set<string>();
 for(const topic of parsed.topics)for(const id of topic.conversationIds){known(id);if(assigned.has(id))throw new Error('A conversation appeared in multiple primary topics.');assigned.add(id);
   if(parsed.conversations.find(c=>c.id===id)?.topicId!==topic.id)throw new Error('Topic membership did not match the classification.');}
 if(assigned.size!==sample.length)throw new Error('Every sampled conversation needs a primary topic.');
 for(const item of parsed.conversations){known(item.id);if(!topicIds.has(item.topicId))throw new Error('Unknown topic in synthesis.');
   const messages=byId.get(item.id)!.messages;
   if(item.evidenceMessageIds.some(id=>!messages.some(m=>m.id===id)))throw new Error('Evidence must belong to its conversation.');
   if(!item.evidenceMessageIds.some(id=>messages.some(m=>m.id===id&&m.role==='customer')))throw new Error('Classification needs customer-message evidence.');}
 for(const item of [...parsed.recommendations,...parsed.knowledgeGaps])item.conversationIds.forEach(known);
 return parsed;
}
