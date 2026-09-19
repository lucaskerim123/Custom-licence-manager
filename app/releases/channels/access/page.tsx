import {db} from '../../../../lib/db';
import {requireUser} from '../../../../lib/session';
import SideNav from '../../../components/SideNav';
import PageHeader from '../../../components/PageHeader';
export const dynamic='force-dynamic';

export default async function ChannelAccess(){
 await requireUser();
 const [channels,access]=await Promise.all([
  db().query(`select channel,label,access_mode,enabled,customer_visible from release_channels order by sort_order,channel`),
  db().query(`select channel,count(*)::int assignments from release_channel_access group by channel order by channel`)
 ]);
 const counts=new Map(access.rows.map((row:any)=>[row.channel,row.assignments]));
 return <div className="shell"><SideNav active="channel-access"/><main className="main"><PageHeader eyebrow="Release Operations / Access" title="Channel Access" description="Customer channel assignment is controlled by the Billing Store. License Manager remains the technical authority and only records/enforces the resulting entitlement." badge="BILLING CONTROLLED"/><section className="section card"><h2>Channel access policy</h2><p className="muted">Stable is implicit for active licences. Open channels are available by default. Closed channels require an assignment from the Billing Store integration. This panel is read-only.</p><div className="table-shell"><table className="table"><thead><tr><th>Channel</th><th>Access</th><th>Status</th><th>Customer visible</th><th>Assignments</th></tr></thead><tbody>{channels.rows.map((c:any)=><tr key={c.channel}><td><strong>{c.label}</strong><div className="muted mono">{c.channel}</div></td><td><span className="badge">{c.channel==='stable'?'Implicit':c.access_mode==='open'?'Open':'Closed'}</span></td><td><span className={c.enabled?'badge ok':'badge off'}>{c.enabled?'Enabled':'Disabled'}</span></td><td>{c.customer_visible?'Yes':'No'}</td><td>{c.channel==='stable'?'All active licences':counts.get(c.channel)||0}</td></tr>)}</tbody></table></div></section></main></div>
}
