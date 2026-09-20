'use client';
import Link from 'next/link';
import {usePathname} from 'next/navigation';
import {useState} from 'react';
import OperationsMenu from './OperationsMenu';
const groups=[
 {label:'Control',items:[['overview','/','Overview'],['licenses','/licenses','Licensing'],['installations','/installations','Installations']]},
 {label:'Release Operations',items:[['base','/releases/base','Base Deployment'],['releases','/releases','Release Updates'],['channels','/releases/channels','Release Channels'],['channel-access','/releases/channels/access','Channel Access']]},
 {label:'System',items:[['products','/products','Products'],['users','/users','Users'],['settings','/settings','System Settings'],['api','/api-docs','API Contract']]}
] as const;
export default function SideNav({active}:{active?:string}){
 const path=usePathname(); const [open,setOpen]=useState(false),[operationsOpen,setOperationsOpen]=useState(false);
 const keyFor=(href:string,key:string)=>active===key||(key==='overview'&&path==='/')||(key!=='overview'&&path.startsWith(href));
 return <>
  <button className="mobile-menu-button" onClick={()=>setOpen(true)} aria-label="Open navigation">☰</button>
  {open&&<button className="mobile-scrim" onClick={()=>setOpen(false)} aria-label="Close navigation"/>}
  <aside className={open?'side open':'side'}>
   <div className="brand"><div className="brand-mark">LM</div><div><strong>License Manager</strong><small>Authority Control Plane</small></div><button className="mobile-close" onClick={()=>setOpen(false)} aria-label="Close navigation">×</button></div>
   <nav className="nav">{groups.map(g=><div className="nav-group" key={g.label}><div className="nav-label">{g.label}</div>{g.items.map(([key,href,label])=><Link key={key} className={keyFor(href,key)?'active':undefined} href={href} onClick={()=>setOpen(false)}><span className="nav-icon">{key==='overview'?'⌂':key==='licenses'?'◇':key==='installations'?'▣':key==='base'?'↳':key==='releases'?'↻':key==='channels'?'≡':key==='channel-access'?'⇄':key==='products'?'◈':key==='users'?'●':'⚙'}</span>{label}</Link>)}{g.label==='System'&&<button className="nav-button" type="button" onClick={()=>setOperationsOpen(true)}><span className="nav-icon">▶</span>Operations</button>}</div>)}</nav>
   <div className="side-status"><span className="status-dot"/> Authority online<div className="muted">Independent licensing & release authority</div></div>
   <form action="/api/auth/logout" method="post"><button className="nav-button" type="submit"><span className="nav-icon">⇥</span>Sign out</button></form>
  </aside>
  {operationsOpen&&<OperationsMenu onClose={()=>setOperationsOpen(false)}/>} 
 </>
}