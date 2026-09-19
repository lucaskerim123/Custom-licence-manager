import {NextResponse} from 'next/server';
import {integrationAuthorized} from '../../../../lib/auth';
import {db} from '../../../../lib/db';

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
    const channel=String(release.channel||'stable');
    if(channel!=='stable'){
      const policy=(await db().query('select access_mode,enabled from release_channels where channel=$1 limit 1',[channel])).rows[0];
      if(!policy?.enabled)return NextResponse.json({error:'RELEASE_CHANNEL_DISABLED'},{status:409});
      if(policy.access_mode==='internal')return NextResponse.json({error:'RELEASE_CHANNEL_INTERNAL'},{status:403});
      if(policy.access_mode==='assigned'){
        const access=(await db().query('select 1 from release_channel_access where license_id=$1 and channel=$2 and (expires_at is null or expires_at>now()) limit 1',[licenseId,channel])).rows[0];
        if(!access)return NextResponse.json({error:'LICENSE_CHANNEL_ACCESS_DENIED'},{status:403});
      }
    }
  }
  const phase=String(body?.phase||'authorize').toLowerCase();
  if(!['authorize','completed','failed'].includes(phase))return NextResponse.json({error:'INVALID_DEPLOYMENT_PHASE'},{status:400});
  const details={action,phase,installationId:installationId||null,licenseId:licenseId||null,releaseVersion:release.version,product:release.product,deploymentId:body?.deploymentId||body?.deployment_id||null,deploymentUrl:body?.deploymentUrl||body?.deployment_url||null,projectId:body?.projectId||body?.project_id||null,projectName:body?.projectName||body?.project_name||null,customerIdentity:body?.customerIdentity&&typeof body.customerIdentity==='object'?body.customerIdentity:null};
  await db().query(`insert into audit_events(actor_user_id,actor,action,resource_type,resource_id,details) values($1,$2,$3,'release',$4,$5)`,[null,actor?.actor||'deployer',phase==='completed'?'deployment.completed':phase==='failed'?'deployment.failed':'deployment.authorize',release.id,JSON.stringify(details)]);
  if(licenseId&&installationId&&phase!=='authorize'){
    await db().query(`update activations set last_seen_at=now(),product_version=coalesce($3,product_version),metadata=coalesce(metadata,'{}'::jsonb)||$4::jsonb where license_id=$1 and installation_id=$2`,[licenseId,installationId,body?.productVersion?String(body.productVersion):null,JSON.stringify({lastDeploymentAt:new Date().toISOString(),lastDeploymentId:details.deploymentId,lastDeploymentUrl:details.deploymentUrl,lastDeploymentStatus:phase,projectId:details.projectId,projectName:details.projectName,customerIdentity:details.customerIdentity})]);
  }
  return NextResponse.json({ok:true,authorized:phase==='authorize',recorded:phase!=='authorize',release:{id:release.id,version:release.version,releaseType:release.release_type,product:release.product,artifactSha256:release.checksum,sourceRepo:release.source_repo,sourceRef:release.source_ref},execution:phase==='authorize'?'customer-deployer':undefined});
  return NextResponse.json({ok:true,authorized:true,release:{id:release.id,version:release.version,releaseType:release.release_type,product:release.product,artifactSha256:release.checksum,sourceRepo:release.source_repo,sourceRef:release.source_ref},execution:'customer-deployer'});
}
