import Link from 'next/link';
import {db} from '../lib/db';
import {requireUser} from '../lib/session';
import SideNav from './components/SideNav';
import PageHeader from './components/PageHeader';

export const dynamic='force-dynamic';

async function stats(){
 const p=db();
 const [licenses,products,published,pending,failed,activations,settings,activity,recent]=await Promise.all([
  p.query("select count(*)::int count from licenses"),
  p.query("select count(*)::int count from products where status <> 'archived'"),
  p.query("select count(*)::int count from releases where status='published'"),
  p.query("select count(*)::int count from releases where status <> 'published' and review_status='pending' and archived_at is null"),
  p.query("select count(*)::int count from releases where coalesce((manifest->'validation'->>'status'),'not_run')='failed' and archived_at is null"),
  p.query("select count(*)::int count from activations where status='active'"),
  p.query("select system_enabled,licensing_enabled,release_system_enabled,deployment_enabled,maintenance_mode,pulse_revision,pulse_at from system_settings where id=true"),
  p.query("select date_trunc('day',created_at)::date as activity_day,count(*)::int as count from audit_events where created_at >= now()-interval '6 days' group by 1 order by 1"),
  p.query("select action,actor,resource_type,created_at from audit_events order by created_at desc limit 7")
 ]);
 return {
  licenses:licenses.rows[0].count,products:products.rows[0].count,published:published.rows[0].count,
  pending:pending.rows[0].count,failed:failed.rows[0].count,activations:activations.rows[0].count,
  settings:settings.rows[0],activity:activity.rows,recent:recent.rows
 };
}

export default async function Home(){
 await requireUser();
 const s=await stats();
 const online=Boolean(s.settings?.system_enabled);
 const services=[
  ['Licensing',Boolean(s.settings?.licensing_enabled),'Runtime validation and issuance'],
  ['Release authority',Boolean(s.settings?.release_system_enabled),'Intake, validation and technical state'],
  ['Deployment authorization',Boolean(s.settings?.deployment_enabled),'Customer deployer authorization'],
  ['Maintenance',Boolean(s.settings?.maintenance_mode),'Controlled validation maintenance']
 ] as const;
 const dayMap=new Map(s.activity.map((x:any)=>[String(x.activity_day).slice(0,10),Number(x.count)]));
 const days=Array.from({length:7},(_,i)=>{const d=new Date();d.setDate(d.getDate()-(6-i));const key=d.toISOString().slice(0,10);return {key,label:d.toLocaleDateString(undefined,{weekday:'short'}),count:dayMap.get(key)||0};});
 const max=Math.max(1,...days.map(x=>x.count));

 return <div className="shell"><SideNav active="overview"/><main className="main">
  <PageHeader eyebrow="Authority Control Plane" title="License Manager" description="Live technical authority for licensing, release validation, deployment authorization and enforcement." badge={online?'LIVE':'OFFLINE'}/>

  <div className="overview-status-row">
   <div className={online?'health-banner healthy':'health-banner offline'}>
    <div><span className={online?'status-light online':'status-light offline'}/><strong>{online?'Authority is healthy':'External authority is offline'}</strong></div>
    <p>{online?'Licensing and release authority are available according to the controls below.':'The admin panel remains available while external authority requests are rejected.'}</p>
   </div>
   <Link href="/settings" className="button secondary">Open API control</Link>
  </div>

  <div className="grid dashboard-metrics">
   <Link href="/licenses" className="card metric-card link-card"><div className="metric-icon icon-indigo">◇</div><div><span className="metric-label">Licenses</span><strong className="metric">{s.licenses}</strong><small>{s.activations} active installations</small></div></Link>
   <Link href="/releases" className="card metric-card link-card"><div className="metric-icon icon-blue">↻</div><div><span className="metric-label">Pending releases</span><strong className="metric">{s.pending}</strong><small>{s.published} published</small></div></Link>
   <Link href="/releases" className="card metric-card link-card"><div className="metric-icon icon-red">!</div><div><span className="metric-label">Validation blockers</span><strong className="metric">{s.failed}</strong><small>{s.failed===0?'No active blockers':'Requires technical review'}</small></div></Link>
   <Link href="/products" className="card metric-card link-card"><div className="metric-icon icon-green">◈</div><div><span className="metric-label">Products</span><strong className="metric">{s.products}</strong><small>Authority product definitions</small></div></Link>
  </div>

  <div className="dashboard-grid section">
   <section className="card chart-card">
    <div className="section-head"><div><div className="eyebrow">Live activity</div><h2>Authority activity</h2><p className="muted">Audited control-plane actions over the last seven days.</p></div><span className="header-badge">7 DAYS</span></div>
    <div className="bar-chart" aria-label="Authority activity over seven days">
      {days.map(day=><div className="bar-column" key={day.key}><div className="bar-value">{day.count}</div><div className="bar-track"><div className="bar-fill" style={{height:`${Math.max(6,Math.round((day.count/max)*100))}%`}}/></div><span>{day.label}</span></div>)}
    </div>
   </section>

   <section className="card control-summary-card">
    <div className="section-head"><div><div className="eyebrow">Runtime</div><h2>API controls</h2><p className="muted">Current authoritative state.</p></div><Link href="/settings" className="text-link">Manage</Link></div>
    <div className="service-list">
      {services.map(([name,value,detail])=><div className="service-row" key={name}><span className={name==='Maintenance'&&value?'status-light warning':value?'status-light online':'status-light offline'}/><div><strong>{name}</strong><small>{detail}</small></div><span className={name==='Maintenance'&&value?'state-pill warning':value?'state-pill online':'state-pill offline'}>{name==='Maintenance'?(value?'Active':'Normal'):(value?'Live':'Off')}</span></div>)}
    </div>
    <div className="pulse-strip"><span>Pulse revision</span><strong>#{Number(s.settings?.pulse_revision||0)}</strong><small>{s.settings?.pulse_at?new Date(s.settings.pulse_at).toLocaleString():'No pulse yet'}</small></div>
   </section>
  </div>

  <div className="dashboard-grid section">
   <section className="card">
    <div className="section-head"><div><div className="eyebrow">Operations</div><h2>Control center</h2></div></div>
    <div className="quick-control-grid">
      <Link href="/releases/base" className="quick-control"><span className="quick-icon">↳</span><div><strong>Base Deployment</strong><small>Validate and publish Base releases</small></div><b>→</b></Link>
      <Link href="/releases" className="quick-control"><span className="quick-icon">↻</span><div><strong>Release Updates</strong><small>Review Engine update candidates</small></div><b>→</b></Link>
      <Link href="/licenses" className="quick-control"><span className="quick-icon">◇</span><div><strong>Licensing</strong><small>Issue and control customer licenses</small></div><b>→</b></Link>
      <Link href="/installations" className="quick-control"><span className="quick-icon">▣</span><div><strong>Installations</strong><small>Inspect runtime and deployment state</small></div><b>→</b></Link>
    </div>
   </section>

   <section className="card recent-card">
    <div className="section-head"><div><div className="eyebrow">Audit stream</div><h2>Recent activity</h2></div></div>
    <div className="activity-list">
      {s.recent.length===0?<div className="empty-state"><strong>No audit activity</strong><span>Authority actions will appear here.</span></div>:s.recent.map((item:any,index:number)=><div className="activity-row" key={index}><span className="activity-dot"/><div><strong>{String(item.action).replaceAll('.',' ')}</strong><small>{item.actor||'system'} · {item.resource_type}</small></div><time>{new Date(item.created_at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</time></div>)}
    </div>
   </section>
  </div>
 </main></div>;
}
