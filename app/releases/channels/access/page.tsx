import {db} from '../../../../lib/db';
import {requireUser} from '../../../../lib/session';
import SideNav from '../../../components/SideNav';
import PageHeader from '../../../components/PageHeader';
export const dynamic='force-dynamic';
const roles=['owner','admin'];
async function save(formData:FormData){
 'use server';
 const user=await requireUser();
 if(!roles.includes(user.role))return;
 const licenseId=String(formData.get('license_id')||'');
 const channel=String(formData.get('channel')||'').toLowerCase();
 const action=String(formData.get('action')||'grant');
 if(!licenseId||!channel||channel==='stable')return;
 if(action==='revoke') await db().query('delete from release_channel_access where license_id=$1 and channel=$2',[licenseId,channel]);
 else await db().query(`insert into release_channel_access(license_id,channel,granted_by,external_reference) values($1,$2,'license-manager-admin',$3) on conflict(license_id,channel) do update set updated_at=now(),granted_by='license-manager-admin'`,[licenseId,String(formData.get('external_reference')||'')||null]);
}
export default async function ChannelAccess(){
 const user=await requireUser();
 const [licenses,channels,access]=await Promise.all([
  db().query(`select l.id,l.license_key_last4,l.customer_external_id,p.slug product from licenses l join products p on p.id=l.product_id where l.status='active' order by l.created_at desc`),
  db().query(`select channel,label,access_mode from release_channels where enabled=true and channel<>'stable' order by sort_order,channel`),
  db().query(`select a.license_id,a.channel,a.expires_at,l.license_key_last4,l.customer_external_id from release_channel_access a join licenses l on l.id=a.license_id order by a.created_at desc`)
 ]);
 return <div className="shell"><SideNav active="channel-access"/><main className="main"><PageHeader eyebrow="Release Operations / Access" title="Channel Access" description="Stable is automatic for active licences. Beta, dev and custom channels are granted here or by the Billing Store integration." badge={String(access.rows.length)}/><section className="section card"><h2>Grant channel access</h2><p className="muted">Billing Store should normally use the integration API. This screen is for operator overrides.</p>{roles.includes(user.role)&&<form className="form form-grid-3" action={save}><label>License<select className="input" name="license_id" required><option value="">Select license</option>{licenses.rows.map((l:any)=><option value={l.id} key={l.id}>••••-{l.license_key_last4} · {l.customer_external_id||l.product}</option>)}</select></label><label>Channel<select className="input" name="channel" required><option value="">Select channel</option>{channels.rows.map((c:any)=><option value={c.channel} key={c.channel}>{c.label} ({c.channel})</option>)}</select></label><label>External reference<input className="input" name="external_reference" placeholder="Order/customer reference"/></label><button className="button">Grant / update</button></form>}</section><section className="section"><div className="section-head"><div><h2>Active assignments</h2><p className="muted">Effective non-stable channel entitlements.</p></div></div><div className="table-shell"><table className="table"><thead><tr><th>License</th><th>Customer</th><th>Channel</th><th>Expires</th><th></th></tr></thead><tbody>{access.rows.map((a:any)=><tr key={a.license_id+'-'+a.channel}><td>••••-{a.license_key_last4}</td><td>{a.customer_external_id||'—'}</td><td><span className="badge">{a.channel}</span></td><td>{a.expires_at?new Date(a.expires_at).toLocaleString():'Never'}</td><td>{roles.includes(user.role)&&<form action={save}><input type="hidden" name="license_id" value={a.license_id}/><input type="hidden" name="channel" value={a.channel}/><input type="hidden" name="action" value="revoke"/><button className="button danger">Revoke</button></form>}</td></tr>)}</tbody></table></div></section></main></div>
}