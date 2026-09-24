import {requireUser} from '../../lib/session';
import {listApiKeys,createApiKey,revokeApiKey,deleteRevokedApiKey,ApiScope} from '../../lib/core/api-keys';
import ApiKeyForm from './form';
import SideNav from '../components/SideNav';
import PageHeader from '../components/PageHeader';
export const dynamic='force-dynamic';
const scopes:ApiScope[]=['license.issue','license.validate','license.manage','releases.read','releases.write','deployment.read','deployment.write'];
async function create(formData:FormData){'use server';const u=await requireUser();if(!['owner','admin'].includes(u.role))return;const name=String(formData.get('name')||'').trim();const selected=String(formData.get('scopes')||'').split(',').filter((x):x is ApiScope=>scopes.includes(x as ApiScope));if(!name||!selected.length)return;const result=await createApiKey({name,scopes:selected,actorUserId:u.id});return result.key;}
async function revoke(formData:FormData){'use server';const u=await requireUser();if(!['owner','admin'].includes(u.role))return;const id=String(formData.get('id')||'');if(id)await revokeApiKey(id,u.id);}
async function deleteRevoked(formData:FormData){'use server';const u=await requireUser();if(!['owner','admin'].includes(u.role))return;const id=String(formData.get('id')||'');if(id)await deleteRevokedApiKey(id,u.id);}
export default async function ApiKeys(){
 const u=await requireUser();
 const keys=await listApiKeys();
 const active=keys.filter((k:any)=>k.status==='active').length;
 const revoked=keys.filter((k:any)=>k.status==='revoked').length;
 const used=keys.filter((k:any)=>Boolean(k.last_used_at)).length;
 const scopeCount=new Set(keys.flatMap((k:any)=>Array.isArray(k.scopes)?k.scopes:[])).size;

 return <div className="shell"><SideNav active="api-keys"/><main className="main">
  <PageHeader eyebrow="System / Machine Access" title="API Access" description="Least-privilege machine credentials for Billing Store, release builders and deployment clients." badge={String(keys.length)}/>

  <div className="grid release-stats">
   <div className="card stat-card"><div className="stat-label">Active credentials</div><div className="metric">{active}</div><small className="muted">Accepted for API authentication</small></div>
   <div className="card stat-card"><div className="stat-label">Revoked</div><div className="metric">{revoked}</div><small className="muted">Retained for audit visibility</small></div>
   <div className="card stat-card"><div className="stat-label">Used credentials</div><div className="metric">{used}</div><small className="muted">Have authenticated at least once</small></div>
   <div className="card stat-card"><div className="stat-label">Scopes in use</div><div className="metric">{scopeCount}</div><small className="muted">Distinct permissions assigned</small></div>
  </div>

  <section className="section authority-workspace">
   <div className="card">
    <div className="section-head"><div><div className="eyebrow">Issue machine credential</div><h2>Create integration key</h2><p className="muted">Use a separate key per integration and grant only the scopes that integration requires.</p></div></div>
    {['owner','admin'].includes(u.role)?<ApiKeyForm action={create} scopes={scopes}/>:<div className="notice">Only Owner and Admin accounts can create or revoke integration keys.</div>}
   </div>
   <aside className="card authority-rail">
    <div className="eyebrow">Scope model</div><h2>Integration boundaries</h2>
    <div className="service-list">
     <div className="service-row"><span className="status-light online"/><div><strong>License API</strong><small>Issue, validate and manage licences.</small></div><span className="badge">3 scopes</span></div>
     <div className="service-row"><span className="status-light online"/><div><strong>Release API</strong><small>Read or write authoritative release state.</small></div><span className="badge">2 scopes</span></div>
     <div className="service-row"><span className="status-light online"/><div><strong>Deployment API</strong><small>Read or report deployment authority events.</small></div><span className="badge">2 scopes</span></div>
    </div>
   </aside>
  </section>

  <section className="section card">
   <div className="section-head"><div><div className="eyebrow">Credential inventory</div><h2>Managed keys</h2><p className="muted">Only the final four characters remain visible after creation. Revocation takes effect at the License Manager authority boundary.</p></div><span className="badge">{keys.length} credentials</span></div>
   <div className="table-shell"><table className="table"><thead><tr><th>Name</th><th>Key</th><th>Scopes</th><th>Status</th><th>Last used</th><th>Control</th></tr></thead><tbody>{keys.map((k:any)=><tr key={k.id}><td><strong>{k.name}</strong></td><td className="mono">lm_••••{k.key_last4}</td><td><div className="scope-pill-list">{(k.scopes as string[]).map((s:string)=><span className="badge" key={s}>{s}</span>)}</div></td><td><span className={k.status==='active'?'state-pill online':'state-pill offline'}>{k.status}</span></td><td>{k.last_used_at?new Date(k.last_used_at).toLocaleString():'Never'}</td><td>{['owner','admin'].includes(u.role)&&<div className="actions">{k.status==='active'&&<form action={revoke}><input type="hidden" name="id" value={k.id}/><button className="button danger">Revoke</button></form>}{k.status==='revoked'&&<form action={deleteRevoked}><input type="hidden" name="id" value={k.id}/><button className="button danger">Delete</button></form>}</div>}</td></tr>)}</tbody></table></div>
  </section>
 </main></div>;
}