import { NextResponse } from 'next/server';
import { integrationAuthorized } from '../../../../../lib/auth';
import { db } from '../../../../../lib/db';

export async function POST(request:Request){
  if(!(await integrationAuthorized(request,'releases.write'))) return NextResponse.json({error:'UNAUTHORIZED'},{status:401});
  const body=await request.json().catch(()=>null);
  const licenseId=String(body?.license_id||'').trim();
  const channel=String(body?.channel||'').trim().toLowerCase();
  const revoke=Boolean(body?.revoke);
  if(!licenseId||!channel)return NextResponse.json({error:'license_id and channel are required'},{status:400});
  if(channel==='stable')return NextResponse.json({error:'STABLE_ACCESS_IS_IMPLICIT'},{status:409});
  const c=(await db().query('select channel,enabled,access_mode from release_channels where channel=$1 limit 1',[channel])).rows[0];
  if(!c)return NextResponse.json({error:'CHANNEL_NOT_FOUND'},{status:404});
  if(!c.enabled)return NextResponse.json({error:'CHANNEL_DISABLED'},{status:409});
  if(c.access_mode==='internal')return NextResponse.json({error:'CHANNEL_IS_INTERNAL'},{status:409});
  const l=(await db().query('select id from licenses where id=$1 limit 1',[licenseId])).rows[0];
  if(!l)return NextResponse.json({error:'LICENSE_NOT_FOUND'},{status:404});
  if(revoke){
    await db().query('delete from release_channel_access where license_id=$1 and channel=$2',[licenseId,channel]);
  }else{
    const expiresAt=body?.expires_at?new Date(String(body.expires_at)):null;
    if(expiresAt && Number.isNaN(expiresAt.getTime()))return NextResponse.json({error:'INVALID_EXPIRES_AT'},{status:400});
    await db().query(`insert into release_channel_access(license_id,channel,granted_by,external_reference,expires_at) values($1,$2,'billing-store',$3,$4) on conflict(license_id,channel) do update set granted_by='billing-store',external_reference=excluded.external_reference,expires_at=excluded.expires_at,updated_at=now()`,[licenseId,channel,body?.external_reference?String(body.external_reference):null,expiresAt]);
  }
  await db().query(`insert into audit_events(actor_user_id,actor,action,resource_type,resource_id,details) values(null,'billing-store',$1,'license',$2,$3)`,[revoke?'release-channel.revoke':'release-channel.grant',licenseId,JSON.stringify({channel,external_reference:body?.external_reference||null})]);
  const access=(await db().query('select * from release_channel_access where license_id=$1 order by channel',[licenseId])).rows;
  return NextResponse.json({license_id:licenseId,channel,granted:!revoke,access});
}