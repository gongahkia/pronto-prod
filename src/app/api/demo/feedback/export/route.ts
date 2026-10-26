import {NextResponse} from 'next/server';
import {getSessionUser} from '@/lib/auth';
import {enterTenantContext} from '@/lib/tenant-context';
import {assertDemoActor} from '@/lib/customer-demo';
import {DEMO_CLIENT_ID,DemoError} from '@/lib/customer-demo-boundary';
import {exportFeedback} from '@/lib/feedback/export';
import {z} from 'zod';
export async function GET(request:Request){
 try{
  const actor=await getSessionUser();if(!actor)return NextResponse.json({error:'Sign in to export feedback.'},{status:401});
  enterTenantContext(actor);await assertDemoActor(actor);
  const params=new URL(request.url).searchParams;
  const parsed=z.object({status:z.enum(['open','all']),cursor:z.string().uuid().optional()}).safeParse({status:params.get('status')??'open',cursor:params.get('cursor')??undefined});
  if(!parsed.success)return NextResponse.json({error:'Invalid feedback export options.'},{status:400});
  const data=await exportFeedback(DEMO_CLIENT_ID,{includeResolved:parsed.data.status==='all',cursor:parsed.data.cursor});
  return new Response(JSON.stringify(data,null,2),{headers:{'Content-Type':'application/json; charset=utf-8','Content-Disposition':'attachment; filename="pronto-feedback.json"','Cache-Control':'private, no-store'}});
 }catch(error){return NextResponse.json({error:error instanceof DemoError?error.message:'Could not export feedback.'},{status:error instanceof DemoError?error.status:500});}
}
