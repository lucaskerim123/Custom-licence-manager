import { NextResponse } from 'next/server';
import { integrationAuthorized } from '../../../../../lib/auth';
import { db } from '../../../../../lib/db';

export async function GET(request: Request) {
  const actor=await integrationAuthorized(request,'deployment.read');
  if(!actor)return NextResponse.json({error:'UNAUTHORIZED'},{status:401});
  const url=new URL(request.url);
  const installationId=String(url.searchParams.get('installation_id')||url.searchParams.get('installationId')||'').trim();
  const licenseId=String(url.searchParams.get('license_id')||url.searchParams.get('licenseId')||'').trim();
  const limit=Math.min(500,Math.max(1,Number(url.searchParams.get('limit')||100)));
  if(!installationId&&!licenseId)return NextResponse.json({error:'installation_id or license_id is required'},{status:400});
  const where=installationId?'installation_id=$1':'license_id=$1';
  const rows=(await db().query(`select id,license_id,activation_id,installation_id,release_id,action,phase,product,product_version,previous_version,deployment_id,deployment_url,project_id,project_name,provider,region,platform,architecture,hostname,client,client_version,source_ip,user_agent,customer_identity,details,created_at from deployment_events where ${where} order by created_at desc limit ${limit}`,[installationId||licenseId])).rows;
  return NextResponse.json({events:rows});
}
