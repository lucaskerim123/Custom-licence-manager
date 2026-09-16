import { NextResponse } from 'next/server';
import { integrationAuthorized } from '../../../../lib/auth';
import { db } from '../../../../lib/db';

const VERCEL_API='https://api.vercel.com';

export async function GET(request: Request) {
  if (!(await integrationAuthorized(request,'deployment.read'))) return NextResponse.json({error:'UNAUTHORIZED'},{status:401});
  const rows=(await db().query(`select id,version,release_type,source_repo,source_ref,deployment_status,vercel_ready,supabase_ready,published_at from releases where status='published' order by published_at desc nulls last,created_at desc limit 100`)).rows;
  return NextResponse.json({deployments:rows});
}

export async function POST(request: Request) {
  const actor=await integrationAuthorized(request,'deployment.write');
  if(!actor)return NextResponse.json({error:'UNAUTHORIZED'},{status:401});
  const body=await request.json().catch(()=>null);
  const action=String(body?.action||'deploy').toLowerCase();
  const releaseId=String(body?.releaseId||body?.release_id||'').trim();
  const token=String(body?.vercelAccessToken||body?.vercel_access_token||'').trim();
  const project=String(body?.vercelProjectId||body?.vercel_project_id||body?.vercelProjectName||body?.vercel_project_name||'').trim();
  const teamId=String(body?.vercelTeamId||body?.vercel_team_id||'').trim();
  if(!releaseId||!token||!project)return NextResponse.json({error:'releaseId, vercelAccessToken and vercelProjectId/vercelProjectName are required'},{status:400});
  const settings=(await db().query('select system_enabled,deployment_enabled from system_settings where id=true')).rows[0];
  if(!settings?.system_enabled||!settings.deployment_enabled)return NextResponse.json({error:'AUTHORITY_UNAVAILABLE'},{status:503});
  if(!['deploy','update','redeploy','rollback'].includes(action))return NextResponse.json({error:'UNSUPPORTED_DEPLOYMENT_ACTION'},{status:400});

  const release=(await db().query(`select r.*,p.slug product from releases r join products p on p.id=r.product_id where r.id=$1 limit 1`,[releaseId])).rows[0];
  if(!release)return NextResponse.json({error:'RELEASE_NOT_FOUND'},{status:404});
  if(release.status!=='published'||release.review_status!=='approved')return NextResponse.json({error:'RELEASE_NOT_DEPLOYABLE'},{status:409});
  if(!release.source_repo||!release.source_ref)return NextResponse.json({error:'RELEASE_SOURCE_NOT_CONFIGURED'},{status:409});
  if(!/^[-a-zA-Z0-9_.]+\/[-a-zA-Z0-9_.]+$/.test(String(release.source_repo)))return NextResponse.json({error:'INVALID_SOURCE_REPO'},{status:400});

  const url=new URL('/v13/deployments',VERCEL_API);if(teamId)url.searchParams.set('teamId',teamId);
  const response=await fetch(url,{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify({name:project,project,target:'production',gitSource:{type:'github',repo:String(release.source_repo),ref:String(release.source_ref)},env:body?.env||{}})});
  const text=await response.text();let result:any={};try{result=text?JSON.parse(text):{}}catch{result={raw:text}};
  if(!response.ok)return NextResponse.json({error:'VERCEL_DEPLOYMENT_FAILED',status:response.status,details:result},{status:502});
  await db().query(`update releases set deployment_status='deploying',vercel_ready=true where id=$1`,[release.id]);
  await db().query(`insert into audit_events(actor_user_id,actor,action,resource_type,resource_id,details) values($1,$2,'deployment.execute','release',$3,$4)`,[null,'billing-store-deployer',release.id,JSON.stringify({action,project,teamId:teamId||null,deploymentId:result.id||result.uid||null,source_repo:release.source_repo,source_ref:release.source_ref})]);
  return NextResponse.json({ok:true,release,deployment:result});
}
