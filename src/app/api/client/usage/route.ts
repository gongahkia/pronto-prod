import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { getUsageEvents,getWorkspaceUsage,usageCsv,usageMonth } from '@/lib/analytics/usage';
export async function GET(request:Request) {
 const user=await requireUser('client');if(!user.clientId)return NextResponse.json({error:'Business assignment required.'},{status:403});
 const params=new URL(request.url).searchParams;
 let period:ReturnType<typeof usageMonth>;
 try {period=usageMonth(params.get('month')??undefined);}catch{return NextResponse.json({error:'Choose a valid billing month.'},{status:400});}
 if(params.get('format')==='csv'){
  const csv=usageCsv(await getUsageEvents(user.clientId,period.from,period.until));
  return new Response(csv,{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename="pronto-usage-${period.month}.csv"`,'Cache-Control':'private, no-store'}});
 }
 return NextResponse.json(await getWorkspaceUsage(user.clientId,period.month),{headers:{'Cache-Control':'private, no-store'}});
}
