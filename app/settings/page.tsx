import {requireUser} from '../../lib/session';
import {getSettings,setSetting,sendPulse,updateRuntimePolicy,type SettingField} from '../../lib/core/settings';
import {createApiKey,listApiKeys,revokeApiKey,deleteRevokedApiKey,type ApiScope} from '../../lib/core/api-keys';
import {redirect} from 'next/navigation';
import {revalidatePath} from 'next/cache';
import SideNav from '../components/SideNav';
import PageHeader from '../components/PageHeader';
import AuthorityControlGrid from '../components/AuthorityControlGrid';

export const dynamic='force-dynamic';

const scopes:{value:ApiScope;label:string}[]=[
 {value:'license.issue',label:'Issue licenses'},
 {value:'license.validate',label:'Validate licenses'},
 {value:'license.manage',label:'Manage licenses and send pulses'},
 {value:'releases.read',label:'Read releases'},
 {value:'releases.write',label:'Write releases'},
 {value:'deployment.read',label:'Read base deployment'},
 {value:'deployment.write',label:'Write base deployment'}
];
const allowedFields:SettingField[]=['system_enabled','licensing_enabled','maintenance_mode','release_system_enabled','deployment_enabled'];

async function updateSettings(formData:FormData){
 'use server';
 const user=await requireUser();if(!['owner','admin'].includes(user.role))return;
 const field=String(formData.get('field')||'') as SettingField;
 if(!allowedFields.includes(field))return;
 await setSetting(field,String(formData.get('value'))==='true',user.id,user.email);
 revalidatePath('/settings');revalidatePath('/');
}
async function updatePolicy(formData:FormData){
 'use server';
 const user=await requireUser();if(!['owner','admin'].includes(user.role))return;
 await updateRuntimePolicy({
  validation_ttl_seconds:Number(formData.get('validation_ttl_seconds')),
  offline_grace_seconds:Number(formData.get('offline_grace_seconds')),
  pulse_poll_seconds:Number(formData.get('pulse_poll_seconds')),
  max_failed_validations:Number(formData.get('max_failed_validations')),
  allow_offline_grace:formData.get('allow_offline_grace')==='on',
 },user.id,user.email);
 revalidatePath('/settings');revalidatePath('/');
}
async function pulse(formData:FormData){
 'use server';
 const user=await requireUser();if(!['owner','admin'].includes(user.role))return;
 await sendPulse(user.id,user.email,String(formData.get('reason')||'manual-admin-pulse'),{source:'settings'});
 revalidatePath('/settings');revalidatePath('/');
}
async function createKey(formData:FormData){'use server';const user=await requireUser();if(!['owner','admin'].includes(user.role))return;const name=String(formData.get('name')||'').trim();const selected=formData.getAll('scope').map(String).filter((s):s is ApiScope=>scopes.some(x=>x.value===s));if(!name||!selected.length)return;const created=await createApiKey({name,scopes:selected,actorUserId:user.id});redirect(`/settings?created=${encodeURIComponent(created.key)}`);}
async function revokeKey(formData:FormData){'use server';const user=await requireUser();if(!['owner','admin'].includes(user.role))return;const id=String(formData.get('id')||'');if(id)await revokeApiKey(id,user.id);}
async function deleteRevokedKey(formData:FormData){'use server';const user=await requireUser();if(!['owner','admin'].includes(user.role))return;const id=String(formData.get('id')||'');if(id)await deleteRevokedApiKey(id,user.id);}

export default async function Settings({searchParams}:{searchParams?:Promise<{created?:string}>}){
 const user=await requireUser();
 const s=await getSettings();
 const keys=await listApiKeys();
 const params=searchParams?await searchParams:{};
 const canManage=['owner','admin'].includes(user.role);

 const rows=[
  {field:'system_enabled',label:'External authority',help:'Master switch for external License Manager APIs. Turning this off rejects runtime licensing, release and deployment authority requests while leaving this admin panel available.',onText:'External API authority is online',offText:'External API authority is offline',enabled:Boolean(s.system_enabled)},
  {field:'licensing_enabled',label:'License validation & issuance',help:'Controls license issuance and runtime validation. Turning this off makes license checks fail closed and automatically sends a pulse.',onText:'Licensing is accepting validations',offText:'Licensing validations are blocked',enabled:Boolean(s.licensing_enabled)},
  {field:'maintenance_mode',label:'Maintenance enforcement',help:'When enabled, runtime validation is deliberately unavailable. Use this for controlled maintenance; clients should fail closed unless the offline grace policy explicitly permits temporary grace.',onText:'Maintenance mode is active',offText:'Normal validation mode',dangerWhen:true,enabled:Boolean(s.maintenance_mode)},
  {field:'release_system_enabled',label:'Release authority',help:'Controls authoritative release intake, validation and state APIs. Billing Store publication remains separate.',onText:'Release authority is online',offText:'Release authority is blocked',enabled:Boolean(s.release_system_enabled)},
  {field:'deployment_enabled',label:'Deployment authorization',help:'Controls License Manager deployment authorization and coordination. Customer deployers still perform execution.',onText:'Deployment authorization is online',offText:'Deployment authorization is blocked',enabled:Boolean(s.deployment_enabled)}
 ];

 const authorityServices=rows.filter(r=>r.field!=='maintenance_mode');const liveCount=authorityServices.filter(r=>r.enabled).length;
 const activeKeys=keys.filter((k:any)=>k.status==='active').length;

 return <div className="shell"><SideNav active="settings"/><main className="main">
  <PageHeader eyebrow="System / Runtime control" title="API Control Center" description="Monitor and control authoritative License Manager APIs, runtime policy, pulse enforcement and machine access." badge={Boolean(s.system_enabled)?'LIVE':'OFFLINE'}/>

  <div className="grid dashboard-metrics api-metrics">
   <div className="card metric-card"><div className="metric-icon icon-green">⚡</div><div><span className="metric-label">Authority services</span><strong className="metric">{liveCount}/5</strong><small>{Boolean(s.system_enabled)?'Master authority online':'Master authority offline'}</small></div></div>
   <div className="card metric-card"><div className="metric-icon icon-indigo">⌁</div><div><span className="metric-label">Active API keys</span><strong className="metric">{activeKeys}</strong><small>{keys.length} managed credentials</small></div></div>
   <div className="card metric-card"><div className="metric-icon icon-blue">◷</div><div><span className="metric-label">Validation TTL</span><strong className="metric">{Number(s.validation_ttl_seconds||60)}s</strong><small>Pulse every {Number(s.pulse_poll_seconds||15)}s</small></div></div>
   <div className="card metric-card"><div className="metric-icon icon-red">#</div><div><span className="metric-label">Pulse revision</span><strong className="metric">{Number(s.pulse_revision||0)}</strong><small>{s.pulse_at?new Date(s.pulse_at).toLocaleString():'No pulse recorded'}</small></div></div>
  </div>

  <section className="section">
   <div className="section-head"><div><div className="eyebrow">Runtime authority</div><h2>API controls</h2><p className="muted">Each control is authoritative and live. State changes are audited and issue a pulse revision so connected runtimes re-check cached authorization.</p></div></div>
   <AuthorityControlGrid rows={rows} canManage={canManage} action={updateSettings}/>
  </section>

  <div className="settings-grid section">
   <section className="card">
    <div className="section-head"><div><div className="eyebrow">Enforcement</div><h2>Runtime validation policy</h2><p className="muted">Cache, polling and fail-closed behaviour for connected runtimes.</p></div><span className="header-badge">PULSE #{Number(s.pulse_revision||0)}</span></div>
    <div className="policy-status">
      <div><span className="status-light online"/><strong>Last authoritative pulse</strong><small>{s.pulse_at?new Date(s.pulse_at).toLocaleString():'Never'} · {s.pulse_reason||'No reason recorded'}</small></div>
      {canManage&&<form action={pulse} className="pulse-form"><input className="input" name="reason" defaultValue="manual-validation-recheck"/><button className="button">Send pulse</button></form>}
    </div>
    {canManage?<form className="policy-grid" action={updatePolicy}>
      <label><span>Validation cache TTL</span><div className="number-input"><input className="input" name="validation_ttl_seconds" type="number" min="5" max="86400" defaultValue={Number(s.validation_ttl_seconds||60)}/><b>sec</b></div></label>
      <label><span>Pulse poll interval</span><div className="number-input"><input className="input" name="pulse_poll_seconds" type="number" min="5" max="3600" defaultValue={Number(s.pulse_poll_seconds||15)}/><b>sec</b></div></label>
      <label><span>Failed validations before lock</span><div className="number-input"><input className="input" name="max_failed_validations" type="number" min="1" max="100" defaultValue={Number(s.max_failed_validations||3)}/><b>tries</b></div></label>
      <label><span>Offline grace</span><div className="number-input"><input className="input" name="offline_grace_seconds" type="number" min="0" max="604800" defaultValue={Number(s.offline_grace_seconds||0)}/><b>sec</b></div></label>
      <label className="toggle-line"><input type="checkbox" name="allow_offline_grace" defaultChecked={Boolean(s.allow_offline_grace)}/><span><b>Allow offline grace</b><small>Temporary use after a previously successful validation when the authority cannot be reached.</small></span></label>
      <div className="policy-submit"><button className="button">Save runtime policy</button></div>
    </form>:<div className="muted">Runtime policy is read-only for your role.</div>}
   </section>

   <section className="card">
    <div className="section-head"><div><div className="eyebrow">Machine access</div><h2>API credentials</h2><p className="muted">Separate least-privilege keys for Billing Store, builders and deployers.</p></div><span className="header-badge">{activeKeys} ACTIVE</span></div>
    {params.created&&<div className="key-created"><strong>New key — copy it now.</strong><code>{params.created}</code></div>}
    {canManage&&<form className="key-create-panel" action={createKey}>
      <label>Name<input className="input" name="name" placeholder="Billing Store / Base Release / Engine Release" required/></label>
      <div className="scope-grid">{scopes.map(scope=><label className="scope-chip" key={scope.value}><input type="checkbox" name="scope" value={scope.value}/><span><b>{scope.value}</b><small>{scope.label}</small></span></label>)}</div>
      <button className="button">Create API key</button>
    </form>}
   </section>
  </div>

  <section className="section card">
   <div className="section-head"><div><div className="eyebrow">Credential inventory</div><h2>Managed API keys</h2></div></div>
   <div className="table-shell"><table className="table"><thead><tr><th>Name</th><th>Key</th><th>Scopes</th><th>Status</th><th>Last used</th><th>Control</th></tr></thead><tbody>{keys.map((k:any)=><tr key={k.id}><td><strong>{k.name}</strong></td><td className="mono">lm_••••{k.key_last4}</td><td>{Array.isArray(k.scopes)?k.scopes.join(', '):String(k.scopes)}</td><td><span className={k.status==='active'?'state-pill online':'state-pill offline'}>{k.status}</span></td><td>{k.last_used_at?new Date(k.last_used_at).toLocaleString():'Never'}</td><td>{canManage&&<>{k.status==='active'&&<form action={revokeKey}><input type="hidden" name="id" value={k.id}/><button className="button danger">Revoke</button></form>}{k.status==='revoked'&&<form action={deleteRevokedKey}><input type="hidden" name="id" value={k.id}/><button className="button danger">Delete</button></form>}</>}</td></tr>)}</tbody></table></div>
  </section>
 </main></div>;
}
