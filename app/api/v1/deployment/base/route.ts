import { NextResponse } from 'next/server';
import { integrationAuthorized } from '../../../../../lib/auth';
import { getLatestRelease } from '../../../../../lib/core/releases';
import { db } from '../../../../../lib/db';

export async function GET(request: Request) {
  if (!integrationAuthorized(request)) return NextResponse.json({ error:'UNAUTHORIZED' }, { status:401 });
  const url=new URL(request.url);const product=url.searchParams.get('product')?.toLowerCase();const channel=url.searchParams.get('channel')||'stable';
  if(!product)return NextResponse.json({error:'product is required'},{status:400});
  const settings=(await db().query('select system_enabled,deployment_enabled from system_settings where id=true')).rows[0];
  if(!settings?.system_enabled||!settings.deployment_enabled)return NextResponse.json({error:'AUTHORITY_UNAVAILABLE'},{status:503});
  const release=await getLatestRelease(product,channel,'base');
  if(!release)return NextResponse.json({error:'BASE_RELEASE_NOT_FOUND'},{status:404});
  return NextResponse.json({product,channel,base_release:release});
}
