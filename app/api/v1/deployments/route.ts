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
  await db().query(`insert into audit_events(actor_user_id,actor,action,resource_type,resource_id,details) values($1,$2,'deployment.authorize','release',$3,$4)`,[null,actor?.actor||'deployer',release.id,JSON.stringify({action,installationId:installationId||null,releaseVersion:release.version,product:release.product})]);
  return NextResponse.json({ok:true,authorized:true,release:{id:release.id,version:release.version,releaseType:release.release_type,product:release.product,artifactSha256:release.checksum,sourceRepo:release.source_repo,sourceRef:release.source_ref},execution:'customer-deployer'});
}
