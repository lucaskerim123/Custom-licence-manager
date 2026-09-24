import {db} from '../../lib/db';
import {requireUser,hashPassword} from '../../lib/session';
import SideNav from '../components/SideNav';
import PageHeader from '../components/PageHeader';
import TableTools from '../components/TableTools';
export const dynamic='force-dynamic';
async function createUser(formData:FormData){'use server';const actor=await requireUser();if(!['owner','admin'].includes(actor.role))return;const email=String(formData.get('email')||'').trim().toLowerCase();const name=String(formData.get('name')||'').trim();const password=String(formData.get('password')||'');const role=String(formData.get('role')||'operator');if(!email||!name||password.length<12||!['admin','operator','viewer'].includes(role))return;const {hash,salt}=hashPassword(password);const result=await db().query(`insert into users(email,password_hash,password_salt,display_name,role) values($1,$2,$3,$4,$5) returning id`,[email,hash,salt,name,role]);await db().query(`insert into audit_events(actor_user_id,actor,action,resource_type,resource_id,details) values($1,$2,'user.create','user',$3,$4)`,[actor.id,actor.email,result.rows[0].id,JSON.stringify({email,role})]);}
async function toggleUser(formData:FormData){'use server';const actor=await requireUser();if(!['owner','admin'].includes(actor.role))return;const id=String(formData.get('id')||'');if(!id||id===actor.id)return;await db().query(`update users set status=case when status='active' then 'disabled' else 'active' end where id=$1 and role <> 'owner'`,[id]);}
export default async function Users(){
 const actor=await requireUser();
 const users=(await db().query('select id,email,display_name,role,status,last_login_at,created_at from users order by created_at desc')).rows;
 const active=users.filter((x:any)=>x.status==='active').length;
 const disabled=users.filter((x:any)=>x.status==='disabled').length;
 const admins=users.filter((x:any)=>x.role==='owner'||x.role==='admin').length;
 const operators=users.filter((x:any)=>x.role==='operator').length;
 return <div className="shell"><SideNav active="users"/><main className="main">
  <PageHeader eyebrow="System / Administrative Access" title="Users" description="Local access to the License Manager control plane. These roles govern this admin panel and do not replace customer or workspace permissions." badge={actor.role.toUpperCase()}/>

  <div className="grid release-stats">
   <div className="card stat-card"><div className="stat-label">Active users</div><div className="metric">{active}</div><small className="muted">Can currently sign in</small></div>
   <div className="card stat-card"><div className="stat-label">Disabled</div><div className="metric">{disabled}</div><small className="muted">Administrative access blocked</small></div>
   <div className="card stat-card"><div className="stat-label">Owners / admins</div><div className="metric">{admins}</div><small className="muted">Can manage authority configuration</small></div>
   <div className="card stat-card"><div className="stat-label">Operators</div><div className="metric">{operators}</div><small className="muted">Operational release access</small></div>
  </div>

  {['owner','admin'].includes(actor.role)&&<section className="section card">
   <div className="section-head"><div><div className="eyebrow">Administrative identity</div><h2>Create user</h2><p className="muted">Create private control-plane access. There is no public registration path.</p></div></div>
   <form className="form form-grid-4" action={createUser}><label>Name<input className="input" name="name" required/></label><label>Email<input className="input" type="email" name="email" required/></label><label>Temporary password<input className="input" type="password" name="password" minLength={12} required/></label><label>Role<select className="input" name="role"><option value="admin">Admin</option><option value="operator">Operator</option><option value="viewer">Viewer</option></select></label><button className="button">Create user</button></form>
  </section>}

  <section className="section card">
   <div className="section-head"><div><div className="eyebrow">Access registry</div><h2>Control-plane users</h2><p className="muted">Owner accounts are protected. Admins can enable or disable non-owner access without deleting historical audit identity.</p></div><span className="badge">{users.length} users</span></div>
   <TableTools targetId="user-table" filters={['active','disabled']}/>
   <div className="table-shell" id="user-table"><table className="table"><thead><tr><th>User</th><th>Role</th><th>Status</th><th>Last sign in</th><th>Created</th><th>Control</th></tr></thead><tbody>{users.map((u:any)=><tr key={u.id} data-row data-filter={u.status} data-search={[u.display_name,u.email,u.role,u.status].join(' ')}><td><strong>{u.display_name}</strong><small className="muted" style={{display:'block'}}>{u.email}</small></td><td><span className="badge">{u.role}</span></td><td><span className={u.status==='active'?'state-pill online':'state-pill offline'}>{u.status}</span></td><td>{u.last_login_at?new Date(u.last_login_at).toLocaleString():'Never'}</td><td>{new Date(u.created_at).toLocaleString()}</td><td>{u.role!=='owner'&&['owner','admin'].includes(actor.role)&&<form action={toggleUser}><input type="hidden" name="id" value={u.id}/><button className="button secondary">{u.status==='active'?'Disable':'Enable'}</button></form>}</td></tr>)}</tbody></table></div>
  </section>
 </main></div>;
}