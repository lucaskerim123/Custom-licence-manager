import {NextResponse} from 'next/server';
import {integrationAuthorized} from '../../../../lib/auth';
import {db} from '../../../../lib/db';
import {recordInstallationCheckIn} from '../../../../lib/core/licenses';

function requestIp(request:Request){return request.headers.get('x-real-ip')?.trim()||request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()||null;}

export async function POST(request:Request){
  const actor=await integrationAuthorized(request,'deployment.write');
  if(!actor)return NextResponse.json({ok:false,code:'UNAUTHORIZED'},{status:401});
  const body=await request.json().catch(()=>null);
  const action=String(body?.action||'deploy').toLowerCase();
  const phase=String(body?.phase||'authorize').toLowerCase();
  const releaseId=String(body?.releaseId||body?.release_id||'').trim();
  const installationId=String(body?.installationId||body?.installation_id||'').trim();
  const rollbackScope=String(body?.rollbackScope||body?.rollback_scope||'base').trim().toLowerCase();
  const updateRollback=action==='rollback'&&rollbackScope==='update';
  if(phase==='sync')return NextResponse.json({ok:false,code:'CUSTOMER_DEPLOYER_EXECUTION_REQUIRED',error:'Provider status checks are executed by the customer deployer; License Manager does not accept customer provider credentials.'},{status:409});
  if(!releaseId)return NextResponse.json({ok:false,code:'RELEASE_ID_REQUIRED'},{status:400});
  if(!['deploy','update','redeploy','rollback'].includes(action))return NextResponse.json({ok:false,code:'UNSUPPORTED_DEPLOYMENT_ACTION'},{status:400});
  if(!['authorize','completed','failed'].includes(phase))return NextResponse.json({ok:false,code:'INVALID_DEPLOYMENT_PHASE'},{status:400});
  const settings=(await db().query('select system_enabled,licensing_enabled,maintenance_mode,deployment_enabled from system_settings where id=true')).rows[0];
  if(!settings?.system_enabled||!settings?.licensing_enabled||settings?.maintenance_mode||!settings?.deployment_enabled)return NextResponse.json({ok:false,code:'AUTHORITY_UNAVAILABLE',authority:{system_enabled:Boolean(settings?.system_enabled),licensing_enabled:Boolean(settings?.licensing_enabled),maintenance_mode:Boolean(settings?.maintenance_mode),deployment_enabled:Boolean(settings?.deployment_enabled)}},{status:503});
  const release=(await db().query(`select r.*,p.slug product from releases r join products p on p.id=r.product_id where r.id=$1 limit 1`,[releaseId])).rows[0];
  if(!release)return NextResponse.json({ok:false,code:'RELEASE_NOT_FOUND'},{status:404});
  if(updateRollback){
    if(release.review_status!=='approved')return NextResponse.json({ok:false,code:'UPDATE_ROLLBACK_NOT_AUTHORIZED'},{status:409});
  }else if(release.status!=='published'||release.review_status!=='approved'||release.archived_at){
    return NextResponse.json({ok:false,code:'RELEASE_NOT_DEPLOYABLE'},{status:409});
  }
  const expectedReleaseType=action==='update'||updateRollback?'update':'base';
  if(String(release.release_type)!==expectedReleaseType)return NextResponse.json({ok:false,code:'RELEASE_TYPE_ACTION_MISMATCH'},{status:409});
  const requestedChannel=String(body?.channel||body?.releaseChannel||body?.release_channel||'').trim().toLowerCase();
  if(requestedChannel&&requestedChannel!==String(release.channel||'').trim().toLowerCase())return NextResponse.json({ok:false,code:'RELEASE_CHANNEL_ACTION_MISMATCH'},{status:409});
  if(!release.checksum)return NextResponse.json({ok:false,code:'RELEASE_ARTIFACT_NOT_VERIFIED'},{status:409});
  const licenseId=String(body?.licenseId||body?.license_id||'').trim();
  if(!licenseId)return NextResponse.json({ok:false,code:'LICENSE_ID_REQUIRED'},{status:403});
  const license=(await db().query(`select id,status,expires_at from licenses where id=$1 and product_id=($2::uuid) limit 1`,[licenseId,release.product_id])).rows[0];
  if(!license||license.status!=='active'||(license.expires_at&&new Date(license.expires_at).getTime()<=Date.now()))return NextResponse.json({ok:false,code:'LICENSE_NOT_ELIGIBLE_FOR_RELEASE'},{status:403});
  if(installationId){
    const activation=(await db().query('select status from activations where license_id=$1 and installation_id=$2 limit 1',[licenseId,installationId])).rows[0];
    if(activation&&activation.status!=='active')return NextResponse.json({ok:false,code:'INSTALLATION_LOCKED_OR_TERMINATED'},{status:403});
    if(!activation&&action!=='deploy')return NextResponse.json({ok:false,code:'INSTALLATION_NOT_REGISTERED'},{status:403});
    // First Base deployment is allowed before runtime licence activation.
    // Billing Store proves entitlement and records the installation/release identity;
    // Base first setup remains authoritative for licence-key activation and the real installation lock.
  }
  const channel=String(release.channel||'stable');
  if(channel!=='stable'&&!updateRollback){
    const policy=(await db().query('select access_mode,enabled from release_channels where channel=$1 limit 1',[channel])).rows[0];
    if(!policy?.enabled)return NextResponse.json({ok:false,code:'RELEASE_CHANNEL_DISABLED'},{status:409});
    if(policy.access_mode==='closed'){
      const access=(await db().query('select 1 from release_channel_access where license_id=$1 and channel=$2 and (expires_at is null or expires_at>now()) limit 1',[licenseId,channel])).rows[0];
      if(!access)return NextResponse.json({ok:false,code:'LICENSE_CHANNEL_ACCESS_DENIED'},{status:403});
    }
  }
  const rawComponents=body?.componentState??body?.components;
  const componentState=Array.isArray(rawComponents)
    ?Object.fromEntries(rawComponents.map((value:any)=>[String(value),{version:String(release.version),status:phase==='completed'?'installed':phase}]))
    :(rawComponents&&typeof rawComponents==='object'?rawComponents:{});
  const installationProductVersion=action==='update'
    ?String(body?.baseVersion||body?.base_version||body?.previousVersion||body?.previous_version||'').trim()||null
    :(body?.productVersion?String(body.productVersion):release.version);
  const details={action,phase,rollbackScope:updateRollback?'update':'base',installationId:installationId||null,licenseId,releaseVersion:release.version,product:release.product,components:componentState,deploymentId:body?.deploymentId||body?.deployment_id||null,deploymentUrl:body?.deploymentUrl||body?.deployment_url||null,projectId:body?.projectId||body?.project_id||null,projectName:body?.projectName||body?.project_name||null,customerIdentity:body?.customerIdentity&&typeof body.customerIdentity==='object'?body.customerIdentity:null};
  await db().query(`insert into audit_events(actor_user_id,actor,action,resource_type,resource_id,details) values($1,$2,$3,'release',$4,$5)`,[null,actor.actor||'deployer',`deployment.${phase}`,release.id,JSON.stringify(details)]);
  if(installationId){
    const completedComponents=phase==='completed'?componentState:{};
    await recordInstallationCheckIn({licenseId,installationId,action:action as any,phase:phase==='authorize'?'started':phase==='completed'?'completed':'failed',product:release.product,productVersion:installationProductVersion,previousVersion:body?.previousVersion?String(body.previousVersion):null,releaseId:release.id,deploymentId:details.deploymentId?String(details.deploymentId):null,deploymentUrl:details.deploymentUrl?String(details.deploymentUrl):null,projectId:details.projectId?String(details.projectId):null,projectName:details.projectName?String(details.projectName):null,provider:body?.provider?String(body.provider):'vercel',region:body?.region?String(body.region):null,platform:body?.platform?String(body.platform):'vercel',architecture:body?.architecture?String(body.architecture):null,hostname:body?.hostname?String(body.hostname):null,client:body?.client?String(body.client):'orbitfs-deployer',clientVersion:body?.clientVersion?String(body.clientVersion):null,sourceIp:requestIp(request),userAgent:request.headers.get('user-agent'),customerIdentity:details.customerIdentity,details:{components:completedComponents,requestedComponents:componentState,deploymentStatus:phase,releaseVersion:String(release.version),rollbackScope:updateRollback?'update':'base'}});
  }
  return NextResponse.json({ok:true,authorized:phase==='authorize',recorded:phase!=='authorize',authority:'orbitfs-license-master-v2',release:{id:release.id,version:release.version,releaseType:release.release_type,product:release.product,artifactSha256:release.checksum,sourceRepo:release.source_repo,sourceRef:release.source_ref},execution:phase==='authorize'?'customer-deployer':undefined});
}
