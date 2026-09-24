import {db} from '../../lib/db';
import {requireUser} from '../../lib/session';
import {licenseControlAction} from './actions';
import LicenseForm,{RotateLicenseButton} from './license-form';
import DeleteLicenseButton from './DeleteLicenseButton';
import SideNav from '../components/SideNav';
import PageHeader from '../components/PageHeader';
import TableTools from '../components/TableTools';
export const dynamic='force-dynamic';
const roles=['owner','admin','operator'];
export default async function Licenses(){
 const user=await requireUser();
 const [products,licenses]=await Promise.all([
  db().query("select id,name from products where status='active' order by name"),
  db().query(\`select l.id,l.license_key_last4,l.status,l.customer_external_id,l.customer_override,l.external_reference,l.expires_at,p.name product,(select count(*) from activations a where a.license_id=l.id) installation_count from licenses l join products p on p.id=l.product_id order by l.created_at desc\`)
 ]);
 const rows=licenses.rows;
 const statuses=[...new Set(rows.map((x:any)=>x.status))];
 const active=rows.filter((x:any)=>x.status==='active').length;
 const suspended=rows.filter((x:any)=>x.status==='suspended').length;
 const revoked=rows.filter((x:any)=>x.status==='revoked'||x.status==='expired').length;
 const installs=rows.reduce((sum:number,x:any)=>sum+Number(x.installation_count||0),0);

 return <div className="shell"><SideNav active="licenses"/><main className="main">
  <PageHeader eyebrow="Authority / Licensing" title="Licenses" description="Issue, rotate, suspend and revoke technical licence authority. Billing Store may supply customer references, but License Manager owns the licence record and runtime validation state." badge={String(rows.length)}/>

  <div className="grid release-stats">
   <div className="card stat-card"><div className="stat-label">Active licences</div><div className="metric">{active}</div><small className="muted">Runtime validation currently permitted</small></div>
   <div className="card stat-card"><div className="stat-label">Suspended</div><div className="metric">{suspended}</div><small className="muted">Temporarily blocked by authority state</small></div>
   <div className="card stat-card"><div className="stat-label">Revoked / expired</div><div className="metric">{revoked}</div><small className="muted">No longer valid for runtime use</small></div>
   <div className="card stat-card"><div className="stat-label">Installations</div><div className="metric">{installs}</div><small className="muted">Bindings observed across all licences</small></div>
  </div>

  <section className="section authority-workspace">
   <div className="authority-workspace-main">
    <div className="section-head"><div><div className="eyebrow">Issue authority</div><h2>Create licence</h2><p className="muted">New licence keys are created here and remain authoritative in License Manager.</p></div></div>
    <LicenseForm products={products.rows}/>
   </div>
   <aside className="card authority-rail">
    <div className="eyebrow">Control model</div><h2>Licence lifecycle</h2>
    <div className="service-list">
      <div className="service-row"><span className="status-light online"/><div><strong>Issue</strong><small>Create the authoritative entitlement.</small></div><span className="state-pill online">Live</span></div>
      <div className="service-row"><span className="status-light warning"/><div><strong>Suspend</strong><small>Fail runtime validation without deleting history.</small></div><span className="state-pill warning">Controlled</span></div>
      <div className="service-row"><span className="status-light offline"/><div><strong>Revoke</strong><small>Terminate licence authority while retaining audit history.</small></div><span className="state-pill offline">Final</span></div>
    </div>
   </aside>
  </section>

  <section className="section card">
   <div className="section-head"><div><div className="eyebrow">Authoritative registry</div><h2>Licence records</h2><p className="muted">Search by licence ID, customer, product or external reference. Installation counts link directly to the matching deployment records.</p></div><span className="badge">{rows.length} total</span></div>
   <TableTools targetId="license-table" filters={statuses}/>
   <div className="table-shell" id="license-table"><table className="table"><thead><tr><th>Licence</th><th>Product</th><th>Customer</th><th>Status</th><th>Installs</th><th>Expiry</th><th>Controls</th></tr></thead><tbody>{rows.map((l:any)=><tr key={l.id} data-row data-filter={l.status} data-search={[l.id,l.product,l.customer_external_id||'',l.external_reference||'',l.status].join(' ')}><td><strong className="mono">{l.id}</strong><small className="muted" style={{display:'block'}}>••••-{l.license_key_last4} · {l.external_reference||'No reference'}</small></td><td>{l.product}</td><td>{l.customer_external_id||'—'} {l.customer_override&&<span className="badge">ADMIN</span>}</td><td><span className={l.status==='active'?'state-pill online':l.status==='suspended'?'state-pill warning':'state-pill offline'}>{l.status}</span></td><td><a className="text-link" href={'/installations?license='+l.id}>{l.installation_count}</a></td><td>{l.expires_at?new Date(l.expires_at).toLocaleString():'Never'}</td><td>{roles.includes(user.role)&&<div className="actions">{l.status!=='revoked'&&l.status!=='expired'&&<RotateLicenseButton licenseId={l.id}/>}<form action={licenseControlAction}><input type="hidden" name="id" value={l.id}/><input type="hidden" name="action" value={l.status==='active'?'suspend':'activate'}/><button className="button secondary">{l.status==='active'?'Suspend':'Activate'}</button></form><DeleteLicenseButton action={licenseControlAction} licenseId={l.id}/></div>}</td></tr>)}</tbody></table></div>
  </section>
 </main></div>;
}