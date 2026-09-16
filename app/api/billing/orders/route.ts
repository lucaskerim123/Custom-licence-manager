import { NextRequest, NextResponse } from 'next/server';
import { db } from '../../../../lib/db';
import { serviceAuthorized } from '../../../../lib/auth';

export async function POST(request:NextRequest){
  if(!serviceAuthorized(request,process.env.BILLING_API_TOKEN)) return NextResponse.json({error:'Unauthorized'},{status:401});
  const body=await request.json();
  if(!body.order_id||!body.customer_id) return NextResponse.json({error:'order_id and customer_id are required'},{status:400});
  await db().query(`insert into audit_events(actor,action,resource_type,resource_id,details) values($1,'billing.order.received','order',$2,$3)`,['billing-store',String(body.order_id),JSON.stringify(body)]);
  return NextResponse.json({accepted:true,authority:'license-manager'});
}
