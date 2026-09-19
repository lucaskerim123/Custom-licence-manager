import {requireUser} from '../../lib/session';
import {listReleaseChannels,saveReleaseChannel} from '../../lib/core/release-channels';
import SideNav from '../components/SideNav';
import LiveRefresh from '../components/LiveRefresh';
export const dynamic='force-dynamic';
const roles=['owner','admin'];
async function save(formData:FormData){
 'use server';const user=await requireUser();if(!roles.includes(user.role))return;
 await saveReleaseChannel({channel:String(formData.get('channel')||''),label:String(formData.get('label')||''),
 description:String(formData.get('description')||''),enabled:formData.get('enabled')==='on',customerVisible:formData.get('customer_visible')==='on',
 sortOrder:Number(formData.get('sort_order')||100),actorUserId:user.id,actor:user.email});
}
export default async function ReleaseChannels(){
 const user=await requireUser(),channels=await listReleaseChannels(true);
 return <div className="shell"><SideNav active="channels"/><main className="main">
  <div className="row" style={{justifyContent:'space-between',alignItems:'flex-start',gap:18}}>
   <div><div className="muted" style={{textTransform:'uppercase',letterSpacing:'.08em'}}>Release Delivery Authority</div><h1 className="title">Release Channels</h1>
   <p className="muted">This is the authoritative channel list used by the Base and Engine release jobs. Billing Store handles customer access to these channels; it does not create the release channels.</p></div>
   <div style={{display:'flex',gap:8,alignItems:'center'}}><LiveRefresh/><span className="badge">MASTER</span></div>
  </div>
  <section className="section card"><h2>Configured channels</h2><p className="muted">Stable, Beta and Development are installed by the release-system schema. Custom channels can be added when needed.</p>
   <div style={{display:'grid',gap:11,marginTop:16}}>{channels.map((c:any)=><article key={c.id} style={{display:'grid',gridTemplateColumns:'minmax(0,1fr) auto',gap:18,padding:15,border:'1px solid #252d3b',borderRadius:13,background:'#0a0f17'}}>
    <div><div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}><strong>{c.label}</strong><span className="badge">{c.channel}</span><span className="badge">{c.enabled?'Enabled':'Disabled'}</span><span className="badge">{c.customer_visible?'Customer visible':'Internal'}</span></div><p className="muted" style={{marginTop:7}}>{c.description||'No description.'}</p></div>
    {roles.includes(user.role)&&<form action={save} style={{display:'grid',gridTemplateColumns:'160px 110px',gap:8,alignItems:'end',minWidth:285}}>
      <input type="hidden" name="channel" value={c.channel}/><input className="input" name="label" value={c.label} readOnly/>
      <input className="input" name="sort_order" defaultValue={c.sort_order} inputMode="numeric"/><input className="input" name="description" defaultValue={c.description}/>
      <label style={{display:'flex',gap:7,alignItems:'center'}}><input type="checkbox" name="enabled" defaultChecked={c.enabled}/> Enabled</label>
      <label style={{display:'flex',gap:7,alignItems:'center'}}><input type="checkbox" name="customer_visible" defaultChecked={c.customer_visible}/> Customer visible</label>
      <button className="button" type="submit">Save</button>
    </form>}</article>)}</div>
  </section>
  {roles.includes(user.role)&&<section className="section card" style={{marginTop:14}}><h2>Add channel</h2><form className="form" action={save}>
    <label>Channel key<input className="input" name="channel" placeholder="internal-canary" required/></label>
    <label>Label<input className="input" name="label" placeholder="Internal Canary" required/></label>
    <label>Description<textarea className="input" name="description" rows={3}/></label>
    <input type="hidden" name="sort_order" value="100"/><label><input type="checkbox" name="enabled" defaultChecked/> Enabled</label>
    <label><input type="checkbox" name="customer_visible" defaultChecked/> Customer visible</label><button className="button">Create channel</button>
  </form></section>}
 </main></div>;
}
