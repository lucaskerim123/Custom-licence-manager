import {requireUser} from '../../lib/session';
import {getSettings,setSetting,sendPulse,updateRuntimePolicy,type SettingField} from '../../lib/core/settings';
import {createApiKey,listApiKeys,revokeApiKey,deleteRevokedApiKey,type ApiScope} from '../../lib/core/api-keys';
import {redirect} from 'next/navigation';
import {revalidatePath} from 'next/cache';
import SideNav from '../components/SideNav';
import PageHeader from '../components/PageHeader';
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
 revalidatePath('/settings');
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
 revalidatePath('/settings');
}
async function pulse(formData:FormData){
 'use server';
 const user=await requireUser();if(!['owner','admin'].includes(user.role))return;
 await sendPulse(user.id,user.email,String(formData.get('reason')||'manual-admin-pulse'),{source:'settings'});
 revalidatePath('/settings');
}
async function createKey(formData:FormData){'use server';const user=await requireUser();if(!['owner','admin'].includes(user.role))return;const name=String(formData.get('name')||'').trim();const selected=formData.getAll('scope').map(String).filter((s):s is ApiScope=>scopes.some(x=>x.value===s));if(!name||!selected.length)return;const created=await createApiKey({name,scopes:selected,actorUserId:user.id});redirect(`/settings?created=${encodeURIComponent(created.key)}`);}
async function revokeKey(formData:FormData){'use server';const user=await requireUser();if(!['owner','admin'].includes(user.role))return;const id=String(formData.get('id')||'');if(id)await revokeApiKey(id,user.id);}
async function deleteRevokedKey(formData:FormData){'use server';const user=await requireUser();if(!['owner','admin'].includes(user.role))return;const id=String(formData.get('id')||'');if(id)await deleteRevokedApiKey(id,user.id);}

export default async function Settings({searchParams}:{searchParams?:Promise<{created?:string}>}){
 const user=await requireUser();const s=await getSettings();const keys=await listApiKeys();const params=searchParams?await searchParams:{};
 const rows:{field:SettingField;label:string;help:string;onText:string;offText:string;dangerWhen:boolean}[]=[
  {field:'system_enabled',label:'External authority',help:'Master switch for external License Manager APIs. Turning this off rejects runtime licensing, release and deployment authority requests while leaving this admin panel available.',onText:'External API authority is online',offText:'External API authority is offline',dangerWhen:false},
  {field:'licensing_enabled',label:'License validation & issuance',help:'Controls license issuance and runtime validation. Turning this off makes license checks fail closed and automatically sends a pulse.',onText:'Licensing is accepting validations',offText:'Licensing validations are blocked',dangerWhen:false},
  {field:'maintenance_mode',label:'Maintenance enforcement',help:'When enabled, runtime validation is deliberately unavailable. Use this for controlled maintenance; clients should fail closed unless the offline grace policy explicitly permits temporary grace.',onText:'Maintenance mode is active',offText:'Normal validation mode',dangerWhen:true},
  {field:'release_system_enabled',label:'Release authority',help:'Controls authoritative release intake, validation and state APIs. Billing Store publication remains separate.',onText:'Release authority is online',offText:'Release authority is blocked',dangerWhen:false},
  {field:'deployment_enabled',label:'Deployment authorization',help:'Controls License Manager deployment authorization and coordination. Customer deployers still perform execution.',onText:'Deployment authorization is online',offText:'Deployment authorization is blocked',dangerWhen:false}
 ];
 const canManage=['owner','admin'].includes(user.role);
 return <div className="shell"><SideNav active="settings"/><main className="main">
  <PageHeader eyebrow="System / Authority" title="System Settings" description="Authoritative licensing controls, runtime grace policy, pulse invalidation and machine credentials." badge={user.role.toUpperCase()}/>
  <section className="card">
   <div className="section-head"><div><h2>Authority controls</h2><p className="muted">These are explicit state controls, not cosmetic toggles. Every changed authority state is audited and sends a new pulse revision so connected systems can re-check cached authorization.</p></div></div>
   <div className="switch-list">{rows.map(r=>{const enabled=Boolean(s[r.field]);return <div key={r.field} className="switch-row"><div><strong>{r.label}</strong><div className="muted">{r.help}</div><small className="muted">{enabled?r.onText:r.offText}</small></div><div className="actions"><span className={enabled?(r.dangerWhen?'badge off':'badge ok'):'badge off'}>{enabled?'ON':'OFF'}</span>{canManage&&<form action={updateSettings}><input type="hidden" name="field" value={r.field}/><input type="hidden" name="value" value={enabled?'false':'true'}/><button className={enabled?'button danger':'button'}>{enabled?'Disable':'Enable'}</button></form>}</div></div>})}</div>
  </section>
  <section className="section card">
   <div className="section-head"><div><h2>Runtime validation & grace policy</h2><p className="muted">License Manager owns these values. Clients should cache successful validation for no longer than the validation TTL and poll the pulse revision at the configured interval. A changed pulse revision must invalidate cached validation immediately.</p></div><span className="badge">Pulse #{Number(s.pulse_revision||0)}</span></div>
   <div className="notice"><strong>Last pulse</strong><div>{s.pulse_at?new Date(s.pulse_at).toLocaleString():'Never'} · {s.pulse_reason||'No reason recorded'}</div></div>
   {canManage?<form className="form form-grid-3" action={updatePolicy}>
    <label>Validation cache TTL (seconds)<input className="input" name="validation_ttl_seconds" type="number" min="5" max="86400" defaultValue={Number(s.validation_ttl_seconds||60)}/><small className="muted">Maximum time a successful validation may be cached without another full validation.</small></label>
    <label>Pulse poll interval (seconds)<input className="input" name="pulse_poll_seconds" type="number" min="5" max="3600" defaultValue={Number(s.pulse_poll_seconds||15)}/><small className="muted">How often connected runtimes should check for a newer pulse revision.</small></label>
    <label>Failed validations before local lock<input className="input" name="max_failed_validations" type="number" min="1" max="100" defaultValue={Number(s.max_failed_validations||3)}/><small className="muted">Guidance for runtimes deciding when repeated validation failures should force a local restricted state.</small></label>
    <label className="check-option"><input type="checkbox" name="allow_offline_grace" defaultChecked={Boolean(s.allow_offline_grace)}/><span><b>Allow offline grace</b><small>Permit a previously valid runtime to remain temporarily usable when the authority cannot be reached. Suspension/revocation pulses should override cached grace as soon as the pulse is observed.</small></span></label>
    <label>Offline grace (seconds)<input className="input" name="offline_grace_seconds" type="number" min="0" max="604800" defaultValue={Number(s.offline_grace_seconds||0)}/><small className="muted">Ignored and stored as 0 while offline grace is disabled.</small></label>
    <div className="actions" style={{alignItems:'end'}}><button className="button">Save runtime policy</button></div>
   </form>:<div className="muted">Runtime policy is read-only for your role.</div>}
   {canManage&&<form className="form" action={pulse} style={{marginTop:18}}><label>Pulse reason<input className="input" name="reason" defaultValue="manual-validation-recheck"/></label><div><button className="button">Send pulse now</button><p className="muted">Forces a new authoritative revision. Connected systems that poll the pulse endpoint should immediately re-run validation/enforcement instead of waiting for their normal cache TTL.</p></div></form>}
  </section>
  <section className="section card"><h2>External API keys</h2><p className="muted">Separate machine credentials should be used for Billing Store, release builders and deployment clients. The admin UI does not use these keys.</p>{params.created&&<div className="notice okBox"><strong>New key — copy it now.</strong><pre className="code-panel" style={{marginTop:10}}>{params.created}</pre></div>}{canManage&&<form className="form key-form" action={createKey}><label>Name<input className="input" name="name" placeholder="Billing Store / Base Release / Engine Release" required/></label><div><strong>Scopes</strong><div className="scope-grid">{scopes.map(scope=><label className="check-option" key={scope.value}><input type="checkbox" name="scope" value={scope.value}/><span><b>{scope.value}</b><small>{scope.label}</small></span></label>)}</div></div><button className="button">Create API key</button></form>}<div style={{marginTop:22}}><h3>Existing keys</h3><div className="table-shell"><table className="table"><thead><tr><th>Name</th><th>Key</th><th>Scopes</th><th>Status</th><th>Last used</th><th>Control</th></tr></thead><tbody>{keys.map((k:any)=><tr key={k.id}><td><strong>{k.name}</strong></td><td className="mono">lm_••••{k.key_last4}</td><td>{Array.isArray(k.scopes)?k.scopes.join(', '):String(k.scopes)}</td><td><span className={k.status==='active'?'badge ok':'badge off'}>{k.status}</span></td><td>{k.last_used_at?new Date(k.last_used_at).toLocaleString():'Never'}</td><td>{canManage&&<>{k.status==='active'&&<form action={revokeKey}><input type="hidden" name="id" value={k.id}/><button className="button danger">Revoke</button></form>}{k.status==='revoked'&&<form action={deleteRevokedKey}><input type="hidden" name="id" value={k.id}/><button className="button danger">Delete</button></form>}</>}</td></tr>)}</tbody></table></div></div></section>
 </main></div>
}
