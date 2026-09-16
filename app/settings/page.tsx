import { db } from '../../lib/db';

export const dynamic = 'force-dynamic';

async function updateSettings(formData: FormData) {
  'use server';
  const field = String(formData.get('field') ?? '');
  if (!['system_enabled','licensing_enabled','maintenance_mode'].includes(field)) return;
  await db().query(`update system_settings set ${field}=not ${field}, updated_at=now() where id=true`);
  await db().query(`insert into audit_events(actor,action,resource_type,details) values($1,$2,$3,$4)`, ['admin',`settings.toggle.${field}`,'system_settings',JSON.stringify({field})]);
}

export default async function Settings() {
  const result = await db().query('select * from system_settings where id=true');
  const s = result.rows[0];
  const rows = [['system_enabled','License Manager online','Controls the manager itself.'],['licensing_enabled','License authority','Controls license issuance/validation authority.'],['maintenance_mode','Maintenance mode','Temporarily rejects product validation.']];
  return <div className="shell"><aside className="side"><div className="brand">License Manager</div><nav className="nav"><a href="/">Overview</a><a href="/licenses">Licenses</a><a href="/products">Products</a><a href="/releases">Releases</a><a className="active" href="/settings">System Settings</a><a href="/api-docs">API Contract</a></nav></aside><main className="main"><div className="top"><div><h1 className="title">System Settings</h1><div className="muted">These controls belong to the License Manager itself. Billing Store is not required to operate them.</div></div></div><div className="section"><div className="card"><div className="form">{rows.map(([field,label,help])=><div key={field} className="notice"><div style={{display:'flex',justifyContent:'space-between',gap:20,alignItems:'center'}}><div><strong>{label}</strong><div className="muted">{help}</div></div><form action={updateSettings}><input type="hidden" name="field" value={field}/><button className={`button ${s[field]?'danger':'secondary'}`} type="submit">{s[field]?'Turn off':'Turn on'}</button></form></div></div>)}</div></div></div></main></div>;
}
