import {NextResponse} from 'next/server';
import {integrationAuthorized} from '../../../../lib/auth';
import {db} from '../../../../lib/db';
import {recordInstallationCheckIn} from '../../../../lib/core/licenses';

function requestIp(request:Request){return request.headers.get('x-real-ip')?.trim()||request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()||null;}

export async function GET(request:Request){
  if(!(await integrationAuthorized(request,'deployment.read')))return NextResponse.json({error:'UNAUTHORIZED'},{status:401});
  const rows=(await db().query(`select id,version,release_type,source_repo,source_ref,deployment_status,vercel_ready,supabase_ready,published_at from releases where status='published' order by published_at desc nulls last,created_at desc limit 100`)).rows;
  return NextResponse.json({deployments:rows});
}

export async function POST(request:Request){
  const actor=await integrationAuthorized(request,'deployment.write');
  if(!actor)return NextResponse.json({error:'UNAUTHORIZED'},{status:401});
  const body=await request.json().catch(()=>null);
  const action=String(body?.action||'deploy').toLowerCase();
  const releaseId=String(body?.releaseId||body?.release_id||'').trim();
  const installationId=String(body?.installationId||body?.installation_id||'').trim();
  if(!releaseId)return NextResponse.json({error:'releaseId is required'},{status:400});
  if(!['deploy','update','redeploy','rollback'].includes(action))return NextResponse.json({error:'UNSUPPORTED_DEPLOYMENT_ACTION'},{status:400});
  const settings=(await db().query('select system_enabled,deployment_enabled from system_settings where id=true')).rows[0];
  if(!settings?.system_enabled||!settings.deployment_enabled)return NextResponse.json({error:'AUTHORITY_UNAVAILABLE'},{status:503});
  const release=(await db().query(`select r.*,p.slug product from releases r join products p on p.id=r.product_id where r.id=$1 limit 1`,[releaseId])).rows[0];
  if(!release)return NextResponse.json({error:'RELEASE_NOT_FOUND'},{status:404});
  if(release.status!=='published'||release.review_status!=='approved')return NextResponse.json({error:'RELEASE_NOT_DEPLOYABLE'},{status:409});
  if(!release.checksum)return NextResponse.json({error:'RELEASE_ARTIFACT_NOT_VERIFIED'},{status:409});
  const licenseId=String(body?.licenseId||body?.license_id||'').trim();
  if(licenseId){
    const license=(await db().query(`select id,status,expires_at from licenses where id=$1 and product_id=($2::uuid) limit 1`,[licenseId,release.product_id])).rows[0];
    if(!license||license.status!=='active'||(license.expires_at&&new Date(license.expires_at).getTime()<=Date.now()))return NextResponse.json({error:'LICENSE_NOT_ELIGIBLE_FOR_RELEASE'},{status:403});
    if(installationId){
      const activation=(await db().query('select status from activations where license_id=$1 and installation_id=$2 limit 1',[licenseId,installationId])).rows[0];
      if(activation && activation.status!=='active')return NextResponse.json({error:'INSTALLATION_LOCKED_OR_TERMINATED'},{status:403});
      if(!activation && action!=='deploy')return NextResponse.json({error:'INSTALLATION_NOT_REGISTERED'},{status:403});
    }
    const channel=String(release.channel||'stable');
    if(channel!=='stable'){
      const policy=(await db().query('select access_mode,enabled from release_channels where channel=$1 limit 1',[channel])).rows[0];
      if(!policy?.enabled)return NextResponse.json({error:'RELEASE_CHANNEL_DISABLED'},{status:409});
      if(policy.access_mode==='closed'){

        const access=(await db().query('select 1 from release_channel_access where license_id=$1 and channel=$2 and (expires_at is null or expires_at>now()) limit 1',[licenseId,channel])).rows[0];
        if(!access)return NextResponse.json({error:'LICENSE_CHANNEL_ACCESS_DENIED'},{status:403});
      }
    }
  }
  const phase=String(body?.phase||'authorize').toLowerCase();
  if(!['authorize','completed','failed'].includes(phase))return NextResponse.json({error:'INVALID_DEPLOYMENT_PHASE'},{status:400});
  const details={action,phase,installationId:installationId||null,licenseId:licenseId||null,releaseVersion:release.version,product:release.product,deploymentId:body?.deploymentId||body?.deployment_id||null,deploymentUrl:body?.deploymentUrl||body?.deployment_url||null,projectId:body?.projectId||body?.project_id||null,projectName:body?.projectName||body?.project_name||null,customerIdentity:body?.customerIdentity&&typeof body.customerIdentity==='object'?body.customerIdentity:null};
  await db().query(`insert into audit_events(actor_user_id,actor,action,resource_type,resource_id,details) values($1,$2,$3,'release',$4,$5)`,[null,actor?.actor||'deployer',phase==='completed'?'deployment.completed':phase==='failed'?'deployment.failed':'deployment.authorize',release.id,JSON.stringify(details)]);
  if(licenseId&&installationId&&phase==='authorize'){
    await recordInstallationCheckIn({
      licenseId,installationId,action:action as any,phase:'authorize',product:release.product,productVersion:body?.productVersion?String(body.productVersion):release.version,
      previousVersion:body?.previousVersion?String(body.previousVersion):null,releaseId:release.id,
      deploymentId:details.deploymentId?String(details.deploymentId):null,deploymentUrl:details.deploymentUrl?String(details.deploymentUrl):null,
      projectId:details.projectId?String(details.projectId):null,projectName:details.projectName?String(details.projectName):null,
      provider:body?.provider?String(body.provider):'vercel',region:body?.region?String(body.region):null,
      platform:body?.platform?String(body.platform):'vercel',architecture:body?.architecture?String(body.architecture):null,
      hostname:body?.hostname?String(body.hostname):null,client:body?.client?String(body.client):'orbitfs-deployer',
      clientVersion:body?.clientVersion?String(body.clientVersion):null,sourceIp:requestIp(request),
      userAgent:request.headers.get('user-agent'),customerIdentity:details.customerIdentity,details:{components:body?.components&&typeof body.components==='object'?body.components:{}}
    });
  }
  if(licenseId&&installationId&&phase!=='authorize'){
    await recordInstallationCheckIn({
      licenseId,installationId,action:action as any,phase:phase==='completed'?'completed':'failed',
      product:release.product,productVersion:body?.productVersion?String(body.productVersion):null,
      previousVersion:body?.previousVersion?String(body.previousVersion):null,releaseId:release.id,
      deploymentId:details.deploymentId?String(details.deploymentId):null,deploymentUrl:details.deploymentUrl?String(details.deploymentUrl):null,
      projectId:details.projectId?String(details.projectId):null,projectName:details.projectName?String(details.projectName):null,
      provider:body?.provider?String(body.provider):'vercel',region:body?.region?String(body.region):null,
      platform:body?.platform?String(body.platform):'vercel',architecture:body?.architecture?String(body.architecture):null,
      hostname:body?.hostname?String(body.hostname):null,client:body?.client?String(body.client):'orbitfs-deployer',
      clientVersion:body?.clientVersion?String(body.clientVersion):null,sourceIp:requestIp(request),
      userAgent:request.headers.get('user-agent'),customerIdentity:details.customerIdentity,details:{
        projectId:details.projectId,projectName:details.projectName,components:body?.components&&typeof body.components==='object'?body.components:{},
        deploymentStatus:phase,requestActor:actor?.actor||'deployer'
      }
    });
  }
  return NextResponse.json({ok:true,authorized:phase==='authorize',recorded:phase!=='authorize',release:{id:release.id,version:release.version,releaseType:release.release_type,product:release.product,artifactSha256:release.checksum,sourceRepo:release.source_repo,sourceRef:release.source_ref},execution:phase==='authorize'?'customer-deployer':undefined});
}
