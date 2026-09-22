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
export default async function Licenses(){const user=await requireUser();const [products,licenses]=await Promise.all([
 db().query("select id,name from products where status='active' order by name"),
 db().query(`select l.id,l.license_key_last4,l.status,l.customer_external_id,l.customer_override,l.external_reference,l.expires_at,p.name product,(select count(*) from activations a where a.license_id=l.id) installation_count from licenses l join products p on p.id=l.product_id order by l.created_at desc`)
]);
const statuses=[...new Set(licenses.rows.map((x:any)=>x.status))];
return <div className="shell"><SideNav active="licenses"/><main className="main"><PageHeader eyebrow="Control / Licensing" title="Licenses" description="Issue, rotate, suspend and terminate licenses. License Manager remains the source of truth; Billing Store identifiers are treated as external references." badge={String(licenses.rows.length)}/>
<LicenseForm products={products.rows}/>
<section className="section"><div className="section-head"><div><h2>License registry</h2><p className="muted">Search by license ID, customer, product or reference.</p></div><span className="badge">{licenses.rows.length} total</span></div><TableTools targetId="license-table" filters={statuses}/><div className="table-shell" id="license-table"><table className="table"><thead><tr><th>License ID</th><th>Product</th><th>Customer</th><th>Status</th><th>Installs</th><th>Expiry</th><th>Controls</th></tr></thead><tbody>{licenses.rows.map((l:any)=><tr key={l.id} data-row data-filter={l.status} data-search={`${l.id} ${l.product} ${l.customer_external_id||''} ${l.external_reference||''} ${l.status}`}><td><div className="mono">{l.id}</div><small className="muted">{l.external_reference||'No reference'}</small></td><td>{l.product}</td><td>{l.customer_external_id||'—'} {l.customer_override&&<span className="badge">ADMIN</span>}</td><td><span className={l.status==='active'?'badge ok':l.status==='suspended'?'badge':'badge off'}>{l.status}</span></td><td><a href={`/installations?license=${l.id}`}>{l.installation_count}</a></td><td>{l.expires_at?new Date(l.expires_at).toLocaleString():'Never'}</td><td>{roles.includes(user.role)&&<div className="actions">{l.status!=='revoked'&&l.status!=='expired'&&<RotateLicenseButton licenseId={l.id}/>}<form action={licenseControlAction}><input type="hidden" name="id" value={l.id}/><input type="hidden" name="action" value={l.status==='active'?'suspend':'activate'}/><button className="button secondary">{l.status==='active'?'Suspend':'Activate'}</button></form><DeleteLicenseButton action={licenseControlAction} licenseId={l.id}/></div>}</td></tr>)}</tbody></table></div></section></main></div>}