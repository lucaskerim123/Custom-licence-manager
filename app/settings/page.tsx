import { requireUser } from '../../lib/session';
import { getSettings, toggleSetting } from '../../lib/core/settings';
import { createApiKey, listApiKeys, revokeApiKey, type ApiScope } from '../../lib/core/api-keys';
import { redirect } from 'next/navigation';

export const dynamic='force-dynamic';
type SettingField='system_enabled'|'licensing_enabled'|'maintenance_mode'|'release_system_enabled'|'deployment_enabled';
const scopes: { value: ApiScope; label: string }[] = [
  { value:'license.issue', label:'Issue licenses' },
  { value:'license.validate', label:'Validate licenses' },
  { value:'license.manage', label:'Manage licenses' },
  { value:'releases.read', label:'Read releases' },
  { value:'releases.write', label:'Write releases' },
  { value:'deployment.read', label:'Read base deployment' },
  { value:'deployment.write', label:'Write base deployment' },
];

async function updateSettings(formData:FormData){
  'use server';
  const user=await requireUser();
  if(!['owner','admin'].includes(user.role))return;
  const field=String(formData.get('field')||'') as SettingField;
  if(!['system_enabled','licensing_enabled','maintenance_mode','release_system_enabled','deployment_enabled'].includes(field))return;
  await toggleSetting(field,user.id,user.email);
}

async function createKey(formData:FormData){
  'use server';
  const user=await requireUser();
  if(!['owner','admin'].includes(user.role))return;
  const name=String(formData.get('name')||'').trim();
  const selected=formData.getAll('scope').map(String).filter((s): s is ApiScope => scopes.some(x=>x.value===s));
  if(!name||selected.length===0)return;
  const created=await createApiKey({name,scopes:selected,actorUserId:user.id});
  redirect(`/settings?created=${encodeURIComponent(created.key)}`);
}

async function revokeKey(formData:FormData){
  'use server';
  const user=await requireUser();
  if(!['owner','admin'].includes(user.role))return;
  const id=String(formData.get('id')||'');
  if(id)await revokeApiKey(id,user.id);
}

export default async function Settings({searchParams}:{searchParams?:Promise<{created?:string}>}){
  const user=await requireUser();
  const s=await getSettings();
  const keys=await listApiKeys();
  const params=searchParams?await searchParams:{};
  const rows:{field:SettingField;label:string;help:string}[]=[
    {field:'system_enabled',label:'External authority online',help:'Master switch for external API operations. The admin panel remains available when this is off.'},
    {field:'licensing_enabled',label:'License authority',help:'Controls license issuance and product validation.'},
    {field:'maintenance_mode',label:'Maintenance mode',help:'Temporarily rejects external licensing validation.'},
    {field:'release_system_enabled',label:'Release system',help:'Controls published release API access.'},
    {field:'deployment_enabled',label:'Base deployment',help:'Controls base-release/deployment API access.'}
  ];
  return <div className="shell"><aside className="side"><div className="brand">License Manager</div><nav className="nav"><a href="/">Overview</a><a href="/licenses">Licenses</a><a href="/products">Products</a><a href="/releases">Releases</a><a href="/users">Users</a><a className="active" href="/settings">System Settings</a><a href="/api-docs">API Contract</a></nav></aside><main className="main"><div className="top"><div><h1 className="title">System Settings</h1><div className="muted">Local controls owned entirely by this License Manager.</div></div><span className="badge ok">{user.role}</span></div><div className="section"><div className="card"><div className="form">{rows.map(r=><div key={r.field} className="notice"><div style={{display:'flex',justifyContent:'space-between',gap:20,alignItems:'center'}}><div><strong>{r.label}</strong><div className="muted">{r.help}</div></div>{['owner','admin'].includes(user.role)&&<form action={updateSettings}><input type="hidden" name="field" value={r.field}/><button className={`button ${Boolean(s[r.field])?'danger':'secondary'}`} type="submit">{Boolean(s[r.field])?'Turn off':'Turn on'}</button></form>}</div></div>)}</div></div></div>

<div className="section card"><h2>External API keys</h2><p className="muted">These keys are for Billing Store, installed products, deployment clients and release/update clients. The admin UI does not use these keys.</p>{params.created&&<div className="notice"><strong>New API key — copy it now.</strong><div className="muted">The plaintext key is shown only once.</div><pre style={{overflowX:'auto',marginTop:10}}>{params.created}</pre></div>}{['owner','admin'].includes(user.role)&&<form className="form" action={createKey}><label>Name<input className="input" name="name" placeholder="Billing Store" required/></label><div><strong>Scopes</strong><div className="muted">Grant only the operations this client needs.</div>{scopes.map(scope=><label key={scope.value} style={{display:'block',marginTop:8}}><input type="checkbox" name="scope" value={scope.value}/> {scope.label}</label>)}</div><button className="button" type="submit">Create API key</button></form>}<div style={{marginTop:24}}><h3>Existing keys</h3>{keys.length===0?<p className="muted">No managed API keys have been created.</p>:<table className="table"><thead><tr><th>Name</th><th>Key</th><th>Scopes</th><th>Status</th><th>Last used</th><th></th></tr></thead><tbody>{keys.map(k=><tr key={k.id}><td>{k.name}</td><td>lm_••••{k.key_last4}</td><td>{Array.isArray(k.scopes)?k.scopes.join(', '):String(k.scopes)}</td><td><span className={`badge ${k.status==='active'?'ok':'off'}`}>{k.status}</span></td><td>{k.last_used_at?new Date(k.last_used_at).toLocaleString():'Never'}</td><td>{['owner','admin'].includes(user.role)&&k.status==='active'&&<form action={revokeKey}><input type="hidden" name="id" value={k.id}/><button className="button danger" type="submit">Revoke</button></form>}</td></tr>)}</tbody></table>}</div></div></main></div>;
}
