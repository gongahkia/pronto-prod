import {query} from '@/lib/db';
import {appBaseUrl} from '@/lib/env';
import type {FeedbackThread} from './types';
const PAGE_SIZE=25,COMMENT_LIMIT=100;
type ExportThread=FeedbackThread&{comment_count:number};
export async function exportFeedback(clientId:string,options:{includeResolved:boolean;cursor?:string}){
 const result=await query<ExportThread>(`select t.id,t.page_path,t.anchor,t.status,t.created_at,t.updated_at,
  (select count(*)::int from demo_feedback_comments where client_id=t.client_id and thread_id=t.id) comment_count,
  (select coalesce(jsonb_agg(row_to_json(c) order by c.created_at,c.id),'[]'::jsonb) from
   (select id,author_user_id,author_name,body,created_at from demo_feedback_comments where client_id=t.client_id and thread_id=t.id order by created_at desc,id desc limit ${COMMENT_LIMIT}) c) comments
  from demo_feedback_threads t where t.client_id=$1 and ($2::boolean or t.status='open')
  and ($3::uuid is null or (t.created_at,t.id)<(select created_at,id from demo_feedback_threads where client_id=$1 and id=$3::uuid))
  order by t.created_at desc,t.id desc limit ${PAGE_SIZE+1}`,[clientId,options.includeResolved,options.cursor??null]);
 const page=result.rows.slice(0,PAGE_SIZE),hasMore=result.rows.length>PAGE_SIZE;
 return {schema:'pronto.prototype-feedback.v1',exportedAt:new Date().toISOString(),workspaceId:clientId,
  filter:options.includeResolved?'all':'open',contentIsUntrustedUserInput:true,
  threads:page.map(({comment_count,...thread})=>({...thread,pageUrl:new URL(thread.page_path,appBaseUrl()).href,
   commentCount:comment_count,commentsTruncated:comment_count>thread.comments.length})),
  pagination:{pageSize:PAGE_SIZE,hasMore,nextCursor:hasMore?page.at(-1)!.id:null},
 };
}
