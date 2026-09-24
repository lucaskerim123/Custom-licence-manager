import {requireUser} from '../../lib/session';
import {getSettings,setSetting,sendPulse,updateRuntimePolicy,type SettingField} from '../../lib/core/settings';
import {revalidatePath} from 'next/cache';
import SideNav from '../components/SideNav';
import PageHeader from '../components/PageHeader';
import AuthorityControlGrid from '../components/AuthorityControlGrid';

export const dynamic='force-dynamic';

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

export default async function Settings(){
 const user=await requireUser();
 const s=await getSettings();
 const canManage=['owner','admin'].includes(user.role);

 const rows=[
  {field:'system_enabled',label:'External authority',help:'Master switch for external License Manager APIs. Turning this off rejects runtime licensing, release and deployment authority requests while leaving this admin panel available.',onText:'External API authority is online',offText:'External API authority is offline',enabled:Boolean(s.system_enabled)},
  {field:'licensing_enabled',label:'License validation & issuance',help:'Controls license issuance and runtime validation. Turning this off makes license checks fail closed and sends a pulse so connected runtimes re-check authority.',onText:'Licensing is accepting validations',offText:'Licensing validations are blocked',enabled:Boolean(s.licensing_enabled)},
  {field:'maintenance_mode',label:'Maintenance enforcement',help:'Makes runtime validation deliberately unavailable while keeping the admin plane accessible. Offline grace remains governed by the runtime policy below.',onText:'Maintenance mode is active',offText:'Normal validation mode',dangerWhen:true,enabled:Boolean(s.maintenance_mode)},
  {field:'release_system_enabled',label:'Release authority',help:'Controls authoritative release intake, validation and state APIs. Billing Store publication remains a separate final gate.',onText:'Release authority is online',offText:'Release authority is blocked',enabled:Boolean(s.release_system_enabled)},
  {field:'deployment_enabled',label:'Deployment authorization',help:'Controls License Manager deployment authorization and coordination. Customer deployers still perform execution in customer-owned environments.',onText:'Deployment authorization is online',offText:'Deployment authorization is blocked',enabled:Boolean(s.deployment_enabled)}
 ];

 const liveCount=rows.filter(r=>r.enabled&&!r.dangerWhen).length;
 const maintenance=Boolean(s.maintenance_mode);

 return <div className="shell"><SideNav active="settings"/><main className="main">
  <PageHeader eyebrow="System / Runtime control" title="API Control Center" description="Control License Manager authority services and runtime enforcement. Integration credentials are managed separately under API Access." badge={Boolean(s.system_enabled)&&!maintenance?'LIVE':maintenance?'MAINTENANCE':'OFFLINE'}/>

  <div className="grid dashboard-metrics api-metrics">
   <div className="card metric-card"><div className="metric-icon icon-green">⚡</div><div><span className="metric-label">Authority services</span><strong className="metric">{liveCount}/4</strong><small>{Boolean(s.system_enabled)?'Master authority enabled':'Master authority offline'}</small></div></div>
   <div className="card metric-card"><div className="metric-icon icon-red">◷</div><div><span className="metric-label">Runtime mode</span><strong className="metric api-mode-metric">{maintenance?'Maintenance':Boolean(s.licensing_enabled)?'Online':'Blocked'}</strong><small>License validation enforcement</small></div></div>
   <div className="card metric-card"><div className="metric-icon icon-blue">⌁</div><div><span className="metric-label">Validation TTL</span><strong className="metric">{Number(s.validation_ttl_seconds||60)}s</strong><small>Pulse poll {Number(s.pulse_poll_seconds||15)}s</small></div></div>
   <div className="card metric-card"><div className="metric-icon icon-indigo">#</div><div><span className="metric-label">Pulse revision</span><strong className="metric">{Number(s.pulse_revision||0)}</strong><small>{s.pulse_at?new Date(s.pulse_at).toLocaleString():'No pulse recorded'}</small></div></div>
  </div>

  <section className="section">
   <div className="section-head"><div><div className="eyebrow">Runtime authority</div><h2>API controls</h2><p className="muted">These switches directly control the five authority states. Changes are audited and pulse connected runtimes when required.</p></div></div>
   <AuthorityControlGrid rows={rows} canManage={canManage} action={updateSettings}/>
  </section>

  <details className="section card collapsible-card">
   <summary className="collapsible-summary">
    <div><div className="eyebrow">Enforcement</div><h2>Runtime validation policy</h2><p className="muted">Cache, pulse polling, failure thresholds and offline grace. Expand only when changing enforcement behaviour.</p></div>
    <div className="collapsible-summary-actions"><span className="header-badge">PULSE #{Number(s.pulse_revision||0)}</span><span className="collapse-chevron">⌄</span></div>
   </summary>
   <div className="collapsible-body">
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
   </div>
  </details>
 </main></div>;
}
