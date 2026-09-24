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

 const counts=new Map(access.rows.map((row:any)=>[row.channel,Number(row.assignments)||0]));
 const totalChannels=channels.rows.length;
 const enabledChannels=channels.rows.filter((c:any)=>c.enabled).length;
 const customerVisible=channels.rows.filter((c:any)=>c.customer_visible).length;
 const explicitAssignments=channels.rows.reduce((sum:number,c:any)=>sum+(c.channel==='stable'?0:(counts.get(c.channel)||0)),0);

 return <div className="shell">
  <SideNav active="channel-access"/>
  <main className="main">
   <PageHeader
    eyebrow="Release Operations / Access"
    title="Channel Access"
    description="Live visibility into channel entitlement enforcement. Billing Store owns customer assignment; License Manager records and enforces the resulting technical access state."
    badge="READ ONLY"
   />

   <div className="grid dashboard-metrics">
    <div className="card metric-card"><div className="metric-icon icon-indigo">≡</div><div><span className="metric-label">Release channels</span><strong className="metric">{totalChannels}</strong><small>{enabledChannels} currently enabled</small></div></div>
    <div className="card metric-card"><div className="metric-icon icon-green">●</div><div><span className="metric-label">Customer visible</span><strong className="metric">{customerVisible}</strong><small>Visible in customer-facing release flows</small></div></div>
    <div className="card metric-card"><div className="metric-icon icon-blue">⇄</div><div><span className="metric-label">Explicit assignments</span><strong className="metric">{explicitAssignments}</strong><small>Recorded from Billing Store authority</small></div></div>
    <div className="card metric-card"><div className="metric-icon icon-red">◇</div><div><span className="metric-label">Stable access</span><strong className="metric">Implicit</strong><small>Available to active licences</small></div></div>
   </div>

   <section className="section channel-boundary">
    <div className="channel-boundary-copy">
      <div className="eyebrow">Authority boundary</div>
      <h2>Assignment and enforcement stay separate</h2>
      <p>Billing Store decides which customers receive closed-channel access. License Manager remains the technical authority that stores the resulting entitlement and enforces it when release access is checked.</p>
    </div>
    <div className="channel-boundary-flow" aria-label="Channel access authority flow">
      <div><span className="boundary-icon">B</span><strong>Billing Store</strong><small>Assigns customer access</small></div>
      <b>→</b>
      <div><span className="boundary-icon">LM</span><strong>License Manager</strong><small>Records and enforces entitlement</small></div>
      <b>→</b>
      <div><span className="boundary-icon">C</span><strong>Customer</strong><small>Receives permitted channel</small></div>
    </div>
   </section>

   <section className="section">
    <div className="section-head">
      <div>
        <div className="eyebrow">Enforcement state</div>
        <h2>Channel access matrix</h2>
        <p className="muted">Every value below is read from the authoritative release channel and access tables. There are no local overrides on this page.</p>
      </div>
      <span className="header-badge">{enabledChannels}/{totalChannels} ENABLED</span>
    </div>

    <div className="channel-access-grid">
      {channels.rows.map((c:any)=>{
        const stable=c.channel==='stable';
        const open=!stable&&c.access_mode==='open';
        const assignments=stable?'All active licences':counts.get(c.channel)||0;
        const accessLabel=stable?'Implicit':open?'Open':'Assigned only';
        const accessDetail=stable
          ?'Active licences receive Stable without an explicit Billing Store assignment.'
          :open
            ?'Eligible customers can access this channel without an explicit assignment.'
            :'Only customers assigned by Billing Store are entitled to this channel.';

        return <article className={c.enabled?'channel-access-card':'channel-access-card disabled'} key={c.channel}>
          <div className="channel-access-head">
            <div className="channel-access-title">
              <span className={c.enabled?'status-light online':'status-light offline'}/>
              <div><strong>{c.label}</strong><code>{c.channel}</code></div>
            </div>
            <span className={c.enabled?'state-pill online':'state-pill offline'}>{c.enabled?'Enabled':'Disabled'}</span>
          </div>

          <div className="channel-access-mode">
            <div className={stable?'channel-mode-icon stable':open?'channel-mode-icon open':'channel-mode-icon closed'}>{stable?'◇':open?'↗':'⌁'}</div>
            <div><span>Access mode</span><strong>{accessLabel}</strong><small>{accessDetail}</small></div>
          </div>

          <div className="channel-access-stats">
            <div><span>Assignments</span><strong>{assignments}</strong></div>
            <div><span>Customer visibility</span><strong>{c.customer_visible?'Visible':'Internal'}</strong></div>
          </div>

          <div className="channel-access-foot">
            <span className={c.customer_visible?'state-pill online':'state-pill warning'}>{c.customer_visible?'Customer visible':'Internal only'}</span>
            <small>{stable?'Stable entitlement is derived from active licence state.':open?'No explicit assignment required.':'Billing Store assignment required.'}</small>
          </div>
        </article>;
      })}
    </div>
   </section>
  </main>
 </div>;
}
