import { requireUser } from '../../../lib/session';
import { db } from '../../../lib/db';
export const dynamic='force-dynamic';

async function deployLatest(){
  'use server';
  const user=await requireUser();
  if(!['owner','admin'].includes(user.role)) return;
  const token=String(process.env.VERCEL_ACCESS_TOKEN||'').trim();
  const project=String(process.env.VERCEL_PROJECT_ID||'').trim();
  const team=String(process.env.VERCEL_TEAM_ID||'').trim();
  if(!token||!project) throw new Error('VERCEL_ACCESS_TOKEN and VERCEL_PROJECT_ID are required for Base deployment control');
  const release=(await db().query(`select r.*,p.slug product,p.name product_name from releases r join products p on p.id=r.product_id where p.slug='orbitfs_base' and r.release_type='base' and r.status='published' order by r.published_at desc nulls last,r.created_at desc limit 1`)).rows[0];
  if(!release) throw new Error('No published Base release is available to deploy');
  const sourceRepo=String(release.source_repo||'lucaskerim123/V1-vercel-base');
  const sourceRef=String(release.source_ref||'base-release');
  const url=new URL('https://api.vercel.com/v13/deployments');
  if(team) url.searchParams.set('teamId',team);
  const response=await fetch(url,{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify({name:project,project,target:'production',gitSource:{type:'github',repo:sourceRepo,ref:sourceRef},meta:{orbitfsReleaseId:release.id,orbitfsVersion:release.version,sourceRepo,sourceRef,action:'base-deploy'}})});
  if(!response.ok){const detail=await response.text();throw new Error(`Vercel deployment failed (${response.status})${detail?`: ${detail.slice(0,300)}`:''}`)}
  await db().query(`update releases set deployment_status='deploying',vercel_ready=true,updated_at=now() where id=$1`,[release.id]);
}

export default async function BaseDeployment(){
  const user=await requireUser();
  const [latest,recent]=await Promise.all([
    db().query(`select r.*,p.slug product,p.name product_name from releases r join products p on p.id=r.product_id where r.release_type='base' and p.slug='orbitfs_base' order by r.created_at desc limit 1`),
    db().query(`select r.id,r.version,r.channel,r.status,r.review_status,r.deployment_status,r.source_repo,r.source_ref,r.source_sha,r.artifact_name,r.updated_at,r.published_at from releases r join products p on p.id=r.product_id where r.release_type='base' and p.slug='orbitfs_base' order by r.created_at desc limit 20`)
  ]);
  const item=latest.rows[0];
  return <div className="shell"><aside className="side"><div className="brand">License Manager</div><nav className="nav"><a href="/">Overview</a><a href="/licenses">Licenses</a><a href="/installations">Installations</a><a href="/products">Products</a><a className="active" href="/releases/base">Base Deployment</a><a href="/releases">Releases &amp; Updates</a><a href="/users">Users</a><a href="/settings">System Settings</a></nav></aside><main className="main">
    <div className="row" style={{justifyContent:'space-between',alignItems:'flex-start'}}><div><div className="muted" style={{textTransform:'uppercase',letterSpacing:'.08em'}}>Deployment Control</div><h1 className="title">Base Deployment</h1><p className="muted">This page is ONLY for applying the latest published OrbitFS Base package. Version creation, validation, review, publishing and rollback metadata are handled separately under Releases &amp; Updates.</p></div><span className="badge">ORBITFS BASE</span></div>
    <section className="section card"><h2>Apply latest Base</h2>{item?<><div className="listrow"><div style={{flex:1}}><strong>{item.product_name} {item.version}</strong><span>{item.status} · review {item.review_status} · deployment {item.deployment_status}</span><small>Source: {item.source_repo||'lucaskerim123/V1-vercel-base'} @ {item.source_ref||'base-release'}</small><small>Commit: {item.source_sha||'—'}</small><small>Artifact: {item.artifact_name||'—'}</small></div>{['owner','admin'].includes(user.role)&&item.status==='published'&&<form action={deployLatest}><button className="button">Apply Latest Base</button></form>}</div></>:<p className="muted">No Base release has been ingested yet.</p>}</section>
    <section className="section card"><h2>Recent Base releases</h2>{recent.rows.length?recent.rows.map((x:any)=><div className="listrow" key={x.id}><div style={{flex:1}}><strong>v{x.version}</strong><span>{x.channel} · {x.status} · review {x.review_status} · deployment {x.deployment_status}</span><small>{x.source_repo||'—'} @ {x.source_ref||'—'} · {(x.source_sha||'').slice(0,12)}</small></div></div>):<p className="muted">No Base releases.</p>}</section>
  </main></div>;
}
