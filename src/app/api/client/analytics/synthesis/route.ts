import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { assertSameOrigin } from '@/lib/http/csrf';
import { generateClientSynthesis,SynthesisBusyError } from '@/lib/analytics/synthesis';
import { ProviderRequestError,LlmConfigurationError } from '@/lib/llm/errors';
import { canViewBusinessConversation } from '@/lib/staff-permissions';
export const maxDuration=60;
export async function POST(request:Request) {
 const csrf=assertSameOrigin(request);if(csrf)return csrf;
 const user=await requireUser('client');if(!user.clientId)return NextResponse.json({error:'Business assignment required.'},{status:403});
 if(!await canViewBusinessConversation(user,user.clientId))return NextResponse.json({error:'Conversation access required.'},{status:403});
 const parsed=z.object({days:z.enum(['7','30','90'])}).strict().safeParse(await request.json().catch(()=>null));
 if(!parsed.success)return NextResponse.json({error:'Choose a valid analysis period.'},{status:400});
 try {const id=await generateClientSynthesis(user.clientId,user.userId,parsed.data.days);return NextResponse.json({id});}
 catch(error){
  const known=error instanceof SynthesisBusyError||error instanceof ProviderRequestError||error instanceof LlmConfigurationError;
  return NextResponse.json({error:known?error.message:'Could not generate a valid synthesis. Existing insights have been kept. Try again.'},
   {status:error instanceof SynthesisBusyError?409:503});
 }
}

export async function GET(request:Request) {
 const user=await requireUser('client');if(!user.clientId||!await canViewBusinessConversation(user,user.clientId))return NextResponse.json({error:'Conversation access required.'},{status:403});
 const params=new URL(request.url).searchParams;
 const parsed=z.object({days:z.enum(['7','30','90']),fingerprint:z.string().regex(/^[a-f0-9]{64}$/)}).safeParse({days:params.get('days'),fingerprint:params.get('fingerprint')});
 if(!parsed.success)return NextResponse.json({error:'Invalid insight status request.'},{status:400});
 const result=await query<{status:string|null;busy:boolean}>(`select
  (select status from client_insight_snapshots where client_id=$1 and window_days=$2 and fingerprint=$3 limit 1) status,
  exists(select 1 from client_insight_snapshots where client_id=$1 and status='generating' and updated_at>=now()-interval '3 minutes') busy`,[user.clientId,Number(parsed.data.days),parsed.data.fingerprint]);
 return NextResponse.json({status:result.rows[0]?.status??'missing',busy:result.rows[0]?.busy??false},{headers:{'Cache-Control':'private, no-store'}});
}
