import {NextResponse} from 'next/server';
import {getSessionUser} from '@/lib/auth';
import {assertSameOrigin} from '@/lib/http/csrf';
import {DemoError} from '@/lib/customer-demo-boundary';
import {requestDrivenDemoProcessing} from '@/lib/deployment-profile';
export const maxDuration=180;
export async function POST(request:Request){
 const csrf=assertSameOrigin(request);if(csrf)return csrf;
 if(!requestDrivenDemoProcessing())return NextResponse.json({error:'Request processing is not enabled.'},{status:404});
 const user=await getSessionUser();if(!user)return NextResponse.json({error:'Sign in to continue processing.'},{status:401});
 // The browser cannot select a tenant, transport, actor or job ID.
 if((await request.text()).trim())return NextResponse.json({error:'This request takes no parameters.'},{status:400});
 try{const {processDemoQueue}=await import('@/lib/demo-processing');
  return NextResponse.json(await processDemoQueue(user),{headers:{'Cache-Control':'private, no-store'}});
 }catch(error){return NextResponse.json({error:error instanceof DemoError?error.message:'Processing is temporarily unavailable. Saved messages will be retried on your next visit.'},
  {status:error instanceof DemoError?error.status:503});}
}
