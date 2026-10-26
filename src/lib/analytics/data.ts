import { createHash } from 'node:crypto';
import { query } from '@/lib/db';
import { plainMessageText } from '@/lib/message-text';
import { deliveredReplySql } from './usage';
import type { AnalyticsConversation, AnalyticsData, AnalyticsWindow, InsightSnapshot } from './types';

export function analyticsWindow(value?: string, now = new Date()) {
  const days = Number(value??30);
  if(days!==7&&days!==30&&days!==90)throw new Error('Choose 7, 30 or 90 days.');
  const until=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate()+1));
  const from=new Date(until.getTime()-days*86400000);
  return {days:days as AnalyticsWindow,from:from.toISOString(),until:until.toISOString()};
}
const scopeSql=`with scope as (
 select c.id,c.customer_name,c.status,c.last_message_at,ch.kind,
   (c.owner_action_required or exists(select 1 from escalations e where e.client_id=c.client_id and e.conversation_id=c.id and e.status in ('open','claimed'))) needs_team,
   (c.ai_should_respond=true and c.status='active' and not c.owner_action_required and latest.sender_role='agent'
    and latest.metadata->>'generationMode'='real'
    and not exists(select 1 from escalations e where e.client_id=c.client_id and e.conversation_id=c.id and e.status in ('open','claimed'))
    and not exists(select 1 from inbound_jobs j where j.client_id=c.client_id and j.conversation_id=c.id and j.status in ('pending','processing','failed','dead'))
    and exists(select 1 from outbound_messages o where o.client_id=c.client_id and o.conversation_id=c.id and o.metadata->>'agentMessageId'=latest.id::text and o.status='sent')) assistant_completed
 from conversations c join channels ch on ch.id=c.channel_id and ch.client_id=c.client_id
 left join lateral(select m.id,m.sender_role,m.metadata from messages m where m.client_id=c.client_id and m.conversation_id=c.id
   and m.sender_role<>'system' order by m.created_at desc,m.id desc limit 1) latest on true
 where c.client_id=$1 and c.deleted_at is null and exists(select 1 from messages m where m.client_id=c.client_id and m.conversation_id=c.id and m.created_at >= $2 and m.created_at < $3)
)`;
export async function getAnalyticsData(clientId: string, period?: string): Promise<AnalyticsData> {
 const window=analyticsWindow(period);const values=[clientId,window.from,window.until];
 const [totals,daily,channels,handoffs,conversations,snapshot]=await Promise.all([
   query<AnalyticsData['totals']>(`${scopeSql} select count(*)::int conversations,count(*) filter(where needs_team)::int as "needsTeam",
     count(*) filter(where assistant_completed)::int as "assistantCompleted",
     (select count(*)::int from messages m join scope s on s.id=m.conversation_id where m.client_id=$1 and m.sender_role='customer' and m.created_at >= $2 and m.created_at < $3) as "customerMessages",
     (select count(*)::int from messages m join scope s on s.id=m.conversation_id where m.client_id=$1 and ${deliveredReplySql}) as "deliveredReplies",
     (select percentile_cont(0.5) within group(order by extract(epoch from reply.at-customer.at))::float
       from scope s join lateral(select min(m.created_at) at from messages m where m.client_id=$1 and m.conversation_id=s.id and m.sender_role='customer' and m.created_at >= $2 and m.created_at < $3) customer on true
       join lateral(select min(o.sent_at) at from outbound_messages o where o.client_id=$1 and o.conversation_id=s.id and o.status='sent' and o.sent_at>=customer.at and o.sent_at < $3) reply on true
       where reply.at is not null) as "firstReplySeconds",
     (select avg(r.score)::float from csat_responses r where r.client_id=$1 and r.created_at >= $2 and r.created_at < $3) as "csatAverage",
     (select count(*)::int from csat_responses r where r.client_id=$1 and r.created_at >= $2 and r.created_at < $3) as "csatResponses" from scope`,values),
   query<AnalyticsData['daily'][number]>(`with activity as (
     select to_char(m.created_at at time zone 'UTC','YYYY-MM-DD') date,count(*)::int customers,0::int replies from messages m
       join conversations c on c.id=m.conversation_id and c.client_id=m.client_id where m.client_id=$1 and c.deleted_at is null and m.sender_role='customer' and m.created_at >= $2 and m.created_at < $3 group by 1
     union all select to_char(delivery.at at time zone 'UTC','YYYY-MM-DD') date,0::int customers,count(*)::int replies from messages m
       join conversations c on c.id=m.conversation_id and c.client_id=m.client_id
       join lateral(select min(o.sent_at) at from outbound_messages o where o.client_id=m.client_id and o.conversation_id=m.conversation_id
         and o.metadata->>'agentMessageId'=m.id::text and o.status='sent' and o.sent_at >= $2 and o.sent_at < $3) delivery on delivery.at is not null
       where m.client_id=$1 and c.deleted_at is null and m.sender_role='agent' and m.metadata->>'generationMode'='real' group by 1
     ) select date,sum(customers)::int customers,sum(replies)::int replies from activity group by date order by date`,values),
   query<AnalyticsData['channels'][number]>(`${scopeSql} select kind,count(*)::int conversations,count(*) filter(where needs_team)::int as "needsTeam" from scope group by kind order by conversations desc`,values),
   query<AnalyticsData['handoffs'][number]>(`select e.reason_code reason,count(distinct e.conversation_id)::int count from escalations e
     join conversations c on c.id=e.conversation_id and c.client_id=e.client_id where e.client_id=$1 and c.deleted_at is null and e.created_at >= $2 and e.created_at < $3 group by reason_code order by count desc limit 8`,values),
   query<{id:string;customer:string;channel:string;status:string;needsTeam:boolean;assistantCompleted:boolean;updatedAt:Date;messages:AnalyticsConversation['messages']}>(`${scopeSql}
     select s.id,coalesce(s.customer_name,'Customer') customer,s.kind channel,s.status,s.needs_team as "needsTeam",coalesce(s.assistant_completed,false) as "assistantCompleted",s.last_message_at as "updatedAt",
       (select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'role',r.sender_role,'body',left(r.body,700)) order by r.created_at,r.id),'[]'::jsonb)
        from((select m.id,m.sender_role,m.body,m.created_at from messages m where m.client_id=$1 and m.conversation_id=s.id and m.sender_role<>'system' and m.created_at >= $2 and m.created_at < $3 order by m.created_at desc,m.id desc limit 6)
          union (select m.id,m.sender_role,m.body,m.created_at from messages m where m.client_id=$1 and m.conversation_id=s.id and m.sender_role='customer' and m.created_at < $3 order by m.created_at desc,m.id desc limit 1)) r) messages
     from scope s order by s.last_message_at desc,s.id desc limit 40`,values),
   query<InsightSnapshot>(`select id,status,fingerprint,provider,model,sample_count,payload,created_at,error_message from client_insight_snapshots
     where client_id=$1 and window_days=$2 and status='ready' order by created_at desc,id desc limit 1`,[clientId,window.days])
 ]);
 const candidates=conversations.rows.map(c=>({...c,updatedAt:c.updatedAt.toISOString(),messages:c.messages.map(m=>({...m,body:plainMessageText(m.body)}))}));
 const sample:AnalyticsConversation[]=[];let characters=0;
 for(const conversation of candidates){const size=JSON.stringify(conversation).length;if(characters+size>42000&&sample.length)break;sample.push(conversation);characters+=size;}
 const fingerprint=createHash('sha256').update(JSON.stringify({version:1,start:window.from,totals:totals.rows[0],sample})).digest('hex');
 const byDate=new Map(daily.rows.map(row=>[row.date,row]));
 const timeline=Array.from({length:window.days},(_,i)=>{const date=new Date(Date.parse(window.from)+i*86400000).toISOString().slice(0,10);return byDate.get(date)??{date,customers:0,replies:0};});
 const latest=snapshot.rows[0];
 return {...window,totals:totals.rows[0],daily:timeline,channels:channels.rows,handoffs:handoffs.rows,sample,fingerprint,
   snapshot:latest?{...latest,created_at:new Date(latest.created_at).toISOString()}:null};
}
