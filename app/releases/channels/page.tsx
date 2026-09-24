import {requireUser} from '../../../lib/session';
import {listReleaseChannels,saveReleaseChannel} from '../../../lib/core/release-channels';
import SideNav from '../../components/SideNav';
import PageHeader from '../../components/PageHeader';
import LiveRefresh from '../../components/LiveRefresh';

export const dynamic='force-dynamic';
const roles=['owner','admin'];

async function save(formData:FormData){
 'use server';
 const user=await requireUser();
 if(!roles.includes(user.role))return;
 await saveReleaseChannel({
  channel:String(formData.get('channel')||''),
  label:String(formData.get('label')||''),
  description:String(formData.get('description')||''),
  enabled:formData.get('enabled')==='on',
  customerVisible:formData.get('customer_visible')==='on',
  accessMode:(String(formData.get('access_mode')||'closed')==='open'?'open':'closed'),
  accessRequestEnabled:formData.get('access_request_enabled')==='on',
  selfJoinEnabled:formData.get('self_join_enabled')==='on',
  sortOrder:Number(formData.get('sort_order')||100),
  actorUserId:user.id,
  actor:user.email
 });
}

export default async function ReleaseChannels(){
 const user=await requireUser();
 const channels=await listReleaseChannels(true);
 const enabled=channels.filter(c=>c.enabled).length;
 const visible=channels.filter(c=>c.customer_visible).length;
 const open=channels.filter(c=>c.access_mode==='open').length;
 const requestable=channels.filter(c=>c.access_request_enabled).length;

 return <div className="shell">
  <SideNav active="channels"/>
  <main className="main">
   <PageHeader
    eyebrow="Release Operations / Authority"
    title="Release Channels"
    description="Define the authoritative release lanes used by Base and Engine releases. Billing Store consumes this policy for customer-facing join, request and assignment workflows."
    badge="MASTER"
   />

   <div className="grid release-stats">
    <div className="card stat-card"><div className="stat-label">Configured channels</div><div className="metric">{channels.length}</div><small className="muted">{enabled} enabled</small></div>
    <div className="card stat-card"><div className="stat-label">Customer visible</div><div className="metric">{visible}</div><small className="muted">Exposed to Billing Store</small></div>
    <div className="card stat-card"><div className="stat-label">Open access</div><div className="metric">{open}</div><small className="muted">No explicit assignment required</small></div>
    <div className="card stat-card"><div className="stat-label">Request enabled</div><div className="metric">{requestable}</div><small className="muted">Customers may request access</small></div>
   </div>

   <section className="section channel-authority-bar">
    <div>
      <div className="eyebrow">Authority model</div>
      <h2>One channel policy, consumed everywhere</h2>
      <p>Channel definitions live here. Dev Panel only selects from them during release preparation. Billing Store reads them for customer-facing channel access and sends access mutations back to License Manager.</p>
    </div>
    <LiveRefresh/>
   </section>

   <div className="channel-authority-grid">
    {channels.map((c:any)=><article className={c.enabled?"channel-authority-card":"channel-authority-card is-disabled"} key={c.id}>
      <div className="channel-authority-head">
        <div className="channel-identity">
          <span className={c.enabled?"status-light online":"status-light offline"}/>
          <div><div className="eyebrow">Release channel</div><h2>{c.label}</h2><code>{c.channel}</code></div>
        </div>
        <span className={c.enabled?"state-pill online":"state-pill offline"}>{c.enabled?"Enabled":"Disabled"}</span>
      </div>

      <p className="channel-description">{c.description||'No description.'}</p>

      <div className="channel-policy-grid">
        <div><span>Access</span><strong>{c.access_mode==='open'?'Open':'Controlled'}</strong><small>{c.access_mode==='open'?'Eligible customers can join without assignment.':'Explicit entitlement or request flow required.'}</small></div>
        <div><span>Visibility</span><strong>{c.customer_visible?'Customer visible':'Internal'}</strong><small>{c.customer_visible?'Billing Store may present this channel.':'Hidden from customer-facing flows.'}</small></div>
        <div><span>Requests</span><strong>{c.access_request_enabled?'Allowed':'Off'}</strong><small>{c.access_request_enabled?'Billing Store may submit customer requests.':'No request action is available.'}</small></div>
        <div><span>Self join</span><strong>{c.self_join_enabled||c.access_mode==='open'?'Allowed':'Off'}</strong><small>{c.self_join_enabled||c.access_mode==='open'?'Customer may join without review.':'Technical entitlement must be granted.'}</small></div>
      </div>

      {roles.includes(user.role)&&<details className="channel-editor">
        <summary>Edit authoritative policy</summary>
        <form className="form channel-editor-form" action={save}>
          <input type="hidden" name="channel" value={c.channel}/>
          <div className="inline-fields">
            <label>Label<input className="input" name="label" defaultValue={c.label}/></label>
            <label>Access<select className="input" name="access_mode" defaultValue={c.access_mode}><option value="open">Open</option><option value="closed">Controlled</option></select></label>
            <label>Sort order<input className="input" name="sort_order" defaultValue={c.sort_order} inputMode="numeric"/></label>
          </div>
          <label>Description<textarea className="input" name="description" defaultValue={c.description} rows={3}/></label>
          <div className="channel-toggle-grid">
            <label className="check-option"><input type="checkbox" name="enabled" defaultChecked={c.enabled}/><span><b>Enabled</b><small>Allow releases to target this channel.</small></span></label>
            <label className="check-option"><input type="checkbox" name="customer_visible" defaultChecked={c.customer_visible}/><span><b>Customer visible</b><small>Expose policy to Billing Store customer flows.</small></span></label>
            <label className="check-option"><input type="checkbox" name="access_request_enabled" defaultChecked={c.access_request_enabled}/><span><b>Allow access requests</b><small>Customers may request controlled access.</small></span></label>
            <label className="check-option"><input type="checkbox" name="self_join_enabled" defaultChecked={c.self_join_enabled}/><span><b>Allow self join</b><small>Customers can join without manual approval.</small></span></label>
          </div>
          <div className="actions"><button className="button">Save policy</button></div>
        </form>
      </details>}
    </article>)}
   </div>

   {roles.includes(user.role)&&<section className="section card channel-create">
    <div className="section-head"><div><div className="eyebrow">New channel</div><h2>Create authoritative release lane</h2><p className="muted">Create the channel once here; downstream systems consume it instead of maintaining their own definitions.</p></div></div>
    <form className="form form-grid-3" action={save}>
      <label>Channel key<input className="input" name="channel" placeholder="internal-canary" required/></label>
      <label>Label<input className="input" name="label" placeholder="Internal Canary" required/></label>
      <label>Description<input className="input" name="description"/></label>
      <label>Access<select className="input" name="access_mode" defaultValue="closed"><option value="open">Open</option><option value="closed">Controlled</option></select></label>
      <input type="hidden" name="sort_order" value="100"/>
      <label className="check-option"><input type="checkbox" name="enabled" defaultChecked/><span><b>Enabled</b><small>Allow release targeting.</small></span></label>
      <label className="check-option"><input type="checkbox" name="customer_visible" defaultChecked/><span><b>Customer visible</b><small>Expose to Billing Store.</small></span></label>
      <label className="check-option"><input type="checkbox" name="access_request_enabled"/><span><b>Allow requests</b><small>Enable customer request flow.</small></span></label>
      <label className="check-option"><input type="checkbox" name="self_join_enabled"/><span><b>Allow self join</b><small>No manual approval required.</small></span></label>
      <button className="button">Create channel</button>
    </form>
   </section>}
  </main>
 </div>;
}
