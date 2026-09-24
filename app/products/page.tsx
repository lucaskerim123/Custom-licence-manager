import {requireUser} from '../../lib/session';
import {createProduct,listProducts,setProductStatus} from '../../lib/core/products';
import SideNav from '../components/SideNav';
import PageHeader from '../components/PageHeader';
import TableTools from '../components/TableTools';
export const dynamic='force-dynamic';
async function create(formData:FormData){'use server';const user=await requireUser();if(!['owner','admin'].includes(user.role))return;const name=String(formData.get('name')||'').trim();const slug=String(formData.get('slug')||'').trim().toLowerCase();if(!name||!slug)return;await createProduct({name,slug,description:String(formData.get('description')||'')||null,actorUserId:user.id,actor:user.email});}
async function status(formData:FormData){'use server';const user=await requireUser();if(!['owner','admin'].includes(user.role))return;const id=String(formData.get('id')||'');const value=String(formData.get('status')||'disabled') as 'active'|'disabled'|'archived';if(['active','disabled','archived'].includes(value))await setProductStatus(id,value,user.id,user.email);}
export default async function Products(){
 const user=await requireUser();
 const products=await listProducts();
 const statuses=[...new Set(products.map((x:any)=>x.status))];
 const active=products.filter((x:any)=>x.status==='active').length;
 const disabled=products.filter((x:any)=>x.status==='disabled').length;
 const archived=products.filter((x:any)=>x.status==='archived').length;
 return <div className="shell"><SideNav active="products"/><main className="main">
  <PageHeader eyebrow="System / Products" title="Products" description="Authoritative product identities used by licensing, release intake and runtime validation." badge={String(products.length)}/>

  <div className="grid release-stats">
   <div className="card stat-card"><div className="stat-label">Configured products</div><div className="metric">{products.length}</div><small className="muted">Known to License Manager</small></div>
   <div className="card stat-card"><div className="stat-label">Active</div><div className="metric">{active}</div><small className="muted">Available for issuance and validation</small></div>
   <div className="card stat-card"><div className="stat-label">Disabled</div><div className="metric">{disabled}</div><small className="muted">Temporarily unavailable</small></div>
   <div className="card stat-card"><div className="stat-label">Archived</div><div className="metric">{archived}</div><small className="muted">Retained for historical references</small></div>
  </div>

  {['owner','admin'].includes(user.role)&&<section className="section card">
   <div className="section-head"><div><div className="eyebrow">Product authority</div><h2>Create product identity</h2><p className="muted">Create a product once here before licences or releases can reference it.</p></div></div>
   <form className="form form-grid-3" action={create}><label>Name<input className="input" name="name" required/></label><label>Slug<input className="input" name="slug" placeholder="orbitfs" pattern="[a-z0-9][a-z0-9._-]*" required/></label><label>Description<input className="input" name="description"/></label><button className="button">Create product</button></form>
  </section>}

  <section className="section card">
   <div className="section-head"><div><div className="eyebrow">Registry</div><h2>Product identities</h2><p className="muted">Changing product state affects whether the identity can participate in active licensing flows.</p></div><span className="badge">{products.length} total</span></div>
   <TableTools targetId="product-table" filters={statuses}/>
   <div className="table-shell" id="product-table"><table className="table"><thead><tr><th>Product</th><th>Slug</th><th>Status</th><th>Created</th><th>Control</th></tr></thead><tbody>{products.map((p:any)=><tr key={p.id} data-row data-filter={p.status} data-search={[p.name,p.slug,p.description||'',p.status].join(' ')}><td><strong>{p.name}</strong><small className="muted" style={{display:'block'}}>{p.description||'No description'}</small></td><td className="mono">{p.slug}</td><td><span className={p.status==='active'?'state-pill online':p.status==='disabled'?'state-pill warning':'state-pill offline'}>{p.status}</span></td><td>{new Date(p.created_at).toLocaleString()}</td><td>{['owner','admin'].includes(user.role)&&p.status!=='archived'&&<form action={status}><input type="hidden" name="id" value={p.id}/><input type="hidden" name="status" value={p.status==='active'?'disabled':'active'}/><button className="button secondary">{p.status==='active'?'Disable':'Enable'}</button></form>}</td></tr>)}</tbody></table></div>
  </section>
 </main></div>;
}