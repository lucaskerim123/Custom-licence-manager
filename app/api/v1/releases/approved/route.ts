import { NextResponse } from 'next/server';
import { integrationAuthorized } from '../../../../../lib/auth';
import { db } from '../../../../../lib/db';

export async function GET(request:Request){
  if(!integrationAuthorized(request)) return NextResponse.json({error:'UNAUTHORIZED'},{status:401});
  const url=new URL(request.url);
  const product=url.searchParams.get('product')?.toLowerCase();
  const channel=url.searchParams.get('channel')||'stable';
  if(!product)return NextResponse.json({error:'product is required'},{status:400});
  const settings=(await db().query('select system_enabled,release_system_enabled from system_settings where id=true')).rows[0];
  if(!settings?.system_enabled||!settings.release_system_enabled)return NextResponse.json({error:'AUTHORITY_UNAVAILABLE'},{status:503});
  const rows=(await db().query(`select r.*,p.slug product,p.name product_name from releases r join products p on p.id=r.product_id where p.slug=$1 and p.status='active' and r.channel=$2 and r.review_status='approved' order by r.created_at desc`,[product,channel])).rows;
  return NextResponse.json({releases:rows});
}
