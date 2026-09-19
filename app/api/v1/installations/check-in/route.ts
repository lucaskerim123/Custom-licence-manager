import { NextResponse } from 'next/server';
import { integrationAuthorized } from '../../../../../lib/auth';
import { recordInstallationCheckIn } from '../../../../../lib/core/licenses';

function requestIp(request: Request) {
  return request.headers.get('x-real-ip')?.trim() || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null;
}

const clean=(value:unknown,max=500)=>String(value??'').trim().slice(0,max)||null;
const object=(value:unknown)=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};

export async function POST(request: Request) {
  const actor=await integrationAuthorized(request,'deployment.write');
  if(!actor)return NextResponse.json({error:'UNAUTHORIZED'},{status:401});
  const body=await request.json().catch(()=>null);
  const licenseId=clean(body?.license_id??body?.licenseId,100);
  const installationId=clean(body?.installation_id??body?.installationId,200);
  const product=clean(body?.product??body?.product_code,100);
  const action=String(body?.action||'check_in').toLowerCase();
  const phase=String(body?.phase||'completed').toLowerCase();
  if(!licenseId||!installationId||!product)return NextResponse.json({error:'license_id, installation_id and product are required'},{status:400});
  if(!['check_in','deploy','update','redeploy','rollback'].includes(action))return NextResponse.json({error:'INVALID_ACTION'},{status:400});
  if(!['started','completed','failed'].includes(phase))return NextResponse.json({error:'INVALID_PHASE'},{status:400});
  try {
    const result=await recordInstallationCheckIn({
      licenseId,installationId,action:action as any,phase:phase as any,product,
      productVersion:clean(body?.product_version??body?.productVersion,100),
      previousVersion:clean(body?.previous_version??body?.previousVersion,100),
      releaseId:clean(body?.release_id??body?.releaseId,100),
      deploymentId:clean(body?.deployment_id??body?.deploymentId,200),
      deploymentUrl:clean(body?.deployment_url??body?.deploymentUrl,1000),
      projectId:clean(body?.project_id??body?.projectId,200),
      projectName:clean(body?.project_name??body?.projectName,200),
      provider:clean(body?.provider,100),
      region:clean(body?.region,100),
      platform:clean(body?.platform,100),
      architecture:clean(body?.architecture,100),
      hostname:clean(body?.hostname,255),
      client:clean(body?.client,100),
      clientVersion:clean(body?.client_version??body?.clientVersion,100),
      sourceIp:requestIp(request),
      userAgent:clean(request.headers.get('user-agent'),1000),
      customerIdentity:object(body?.customer_identity??body?.customerIdentity),
      details:object(body?.details)
    });
    return NextResponse.json(result);
  } catch(error:any) {
    return NextResponse.json({error:String(error?.message||'Installation check-in failed'),code:String(error?.code||'INSTALLATION_CHECKIN_FAILED')},{status:Number(error?.status||500)});
  }
}
