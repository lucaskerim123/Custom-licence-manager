import Link from 'next/link';
type NavKey='overview'|'licenses'|'installations'|'products'|'base'|'releases'|'channels'|'users'|'settings'|'api';
const groups=[
 {label:'Control',items:[['overview','/','Overview'],['licenses','/licenses','Licensing'],['installations','/installations','Installations']]},
 {label:'Release Operations',items:[['base','/releases/base','Base Deployment'],['releases','/releases','Release Updates'],['channels','/releases/channels','Release Channels']]},
 {label:'System',items:[['products','/products','Products'],['users','/users','Users'],['settings','/settings','System Settings'],['api','/api-docs','API Contract']]}
] as const;
export default function SideNav({active}:{active?:NavKey}){
 return <aside className="side">
  <div className="brand"><div className="brand-mark">LM</div><div><strong>License Manager</strong><small>Authority Control Plane</small></div></div>
  <nav className="nav">{groups.map(g=><div className="nav-group" key={g.label}><div className="nav-label">{g.label}</div>{g.items.map(([key,href,label])=><Link key={key} className={active===key?'active':undefined} href={href}><span className="nav-icon">{key==='overview'?'⌂':key==='licenses'?'◇':key==='installations'?'▣':key==='base'?'↳':key==='releases'?'↻':key==='channels'?'≡':key==='products'?'◈':key==='users'?'●':key==='settings'?'⚙':'⌘'}</span>{label}</Link>)}</div>)}</nav>
  <div className="side-status"><span className="status-dot"/> Authority online<div className="muted">Independent release & licensing authority</div></div>
  <form action="/api/auth/logout" method="post"><button className="nav-button" type="submit">Sign out</button></form>
 </aside>
}