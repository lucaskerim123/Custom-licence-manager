'use client';
import {useCallback,useEffect,useState} from 'react';
import styles from './operations-menu.module.css';
type Run={id:number;status:string;conclusion:string|null;run_number:number;head_sha:string;updated_at:string;html_url:string;name:string}|null;
type Job={repo:string;label:string;ci:Run;deploy:Run};
type Jobs=Record<'licenseManager'|'billingStore',Job>;
type UpdateSystem={key:string;label:string;repo:string;currentSha:string;baselineSha:string|null;updateAvailable:boolean;latestCi:Run;lastSuccessfulCi:Run;latestDeploy:Run;commits:any[];commitCount:number;changedFiles:any[];changedFileCount:number;completeFileScan:boolean;checkedAt:string;githubCompareUrl:string;currentCommitUrl:string};

function state(run:Run){if(!run)return{text:'NO RUN',kind:'neutral'};if(run.status!=='completed')return{text:run.status.toUpperCase(),kind:'running'};if(run.conclusion==='success')return{text:'PASSED',kind:'ok'};if(run.conclusion==='cancelled')return{text:'CANCELLED',kind:'neutral'};return{text:'FAILED',kind:'bad'}}
function time(value?:string){return value?new Date(value).toLocaleString():'—'}

export default function OperationsMenu({onClose}:{onClose:()=>void}){
 const [jobs,setJobs]=useState<Jobs|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(''),[active,setActive]=useState<Record<string,number>>({}),[updates,setUpdates]=useState<UpdateSystem[]>([]),[checking,setChecking]=useState(false),[checkedAt,setCheckedAt]=useState('');
 const load=useCallback(async()=>{try{const r=await fetch('/api/operations',{cache:'no-store'});const d=await r.json();if(!r.ok)throw new Error(d.error||'Unable to load job status.');setJobs(d.jobs);setError('')}catch(e:any){setError(e.message||'Unable to load job status.')}},[]);
 const checkUpdates=useCallback(async()=>{setChecking(true);try{const r=await fetch('/api/operations/updates',{cache:'no-store'});const d=await r.json();if(!r.ok)throw new Error(d.error||'Unable to check repository updates.');setUpdates(d.systems||[]);setCheckedAt(d.checkedAt||'')}catch(e:any){setError(e.message||'Unable to check repository updates.')}finally{setChecking(false)}},[]);
 useEffect(()=>{load();checkUpdates()},[load,checkUpdates]);
 useEffect(()=>{if(!jobs)return;const running=Object.values(jobs).some(j=>(j.ci&&j.ci.status!=='completed')||(j.deploy&&j.deploy.status!=='completed'));if(!running)return;const t=setInterval(load,10000);return()=>clearInterval(t)},[jobs,load]);
 async function run(job:'licenseManager'|'billingStore',action:'ci'|'deploy'|'override-deploy'){
  if((action==='deploy'||action==='override-deploy')&&!window.confirm((action==='override-deploy'?'OVERRIDE DEPLOY':'Deploy')+' '+jobs?.[job].label+'?\n\nThis starts the existing manual production workflow on main.'))return;
  setBusy(job+action);setError('');
  try{const r=await fetch('/api/operations',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({job,action})});const d=await r.json();if(!r.ok)throw new Error(d.error||'Unable to start job.');if(d.run){setJobs(prev=>prev?{...prev,[job]:{...prev[job],[action==='ci'?'ci':'deploy']:d.run}}:prev);setActive(prev=>({...prev,[job+action]:d.run.id}))}}catch(e:any){setError(e.message||'Unable to start job.')}finally{setBusy('')}
 }
 return <div className={styles.backdrop} onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}>
  <section className={styles.menu} role="dialog" aria-modal="true" aria-labelledby="operations-title">
   <header className={styles.header}><div><div className={styles.eyebrow}>LICENSE MANAGER / SYSTEM</div><h2 id="operations-title">Operations</h2><p>Run, monitor and audit CI, production deployment and repository changes.</p></div><button className={styles.close} onClick={onClose} aria-label="Close operations">×</button></header>
   {error&&<div className={styles.error}><strong>Operation error</strong><span>{error}</span></div>}
   <section className={styles.updateBox}><div><strong>Repository update monitor</strong><span>Scans the complete main tree — code, config, docs, workflows, assets, deleted files and any other file change.</span></div><button onClick={checkUpdates} disabled={checking}>{checking?'Scanning…':'Check for updates'}</button></section>
   {updates.some(x=>x.updateAvailable)&&<div className={styles.updateAlert}><strong>Updates detected</strong><span>{updates.filter(x=>x.updateAvailable).map(x=>x.label+' · '+x.changedFileCount+' files · '+x.commitCount+' commits').join(' | ')}</span></div>}
   {checkedAt&&<div className={styles.checked}>Last repository scan: {time(checkedAt)}</div>}
   {!jobs&&!error&&<div className={styles.loading}>Loading GitHub status…</div>}
   {jobs&&<div className={styles.systems}>{(['licenseManager','billingStore'] as const).map(key=>{const j=jobs[key],ci=state(j.ci),dep=state(j.deploy),up=updates.find(x=>x.key===key);return <article className={styles.system} key={key}>
    <div className={styles.systemHead}><div><strong>{j.label}</strong><code>{j.repo}</code></div><span className={styles.badge+' '+styles[ci.kind]}>CI {ci.text}</span></div>
    {up&&<div className={up.updateAvailable?styles.repoAlert:styles.repoClean}>{up.updateAvailable?<><strong>Unvalidated changes</strong><span>{up.commitCount} commit{up.commitCount===1?'':'s'} · {up.changedFileCount} changed file{up.changedFileCount===1?'':'s'}{!up.completeFileScan?' · tree scan truncated':''}</span><a href={up.githubCompareUrl} target="_blank" rel="noreferrer">Review all changes</a><details className={styles.changeDetails}><summary>Show gathered commits and every changed file</summary><div className={styles.changeList}><strong>Commits</strong>{(up.commits||[]).map((c:any)=><a key={c.sha} href={c.html_url} target="_blank" rel="noreferrer"><code>{c.sha.slice(0,8)}</code><span>{c.message}</span><small>{c.author} · {time(c.date)}</small></a>)}<strong>Files</strong>{(up.changedFiles||[]).map((file:any)=><div key={file.path}><code>{file.status}</code><span>{file.path}</span></div>)}</div></details></>:<span>main matches the last successful CI/deployment baseline.</span>}</div>}
    <div className={styles.row}><div><strong>Production Preflight</strong><span>{j.ci?'#'+j.ci.run_number+' · '+time(j.ci.updated_at)+' · '+j.ci.head_sha.slice(0,12):'No run recorded'}</span></div><div className={styles.actions}><button onClick={()=>run(key,'ci')} disabled={!!busy}>{busy===key+'ci'?'Starting…':'Run CI'}</button>{j.ci&&<a href={'/operations/run?system='+key+'&runId='+j.ci.id}>{active[key+'ci']===j.ci.id?'Open live run':'View run'}</a>}</div></div>
    <div className={styles.row}><div><strong>Production Deployment</strong><span>{j.deploy?'#'+j.deploy.run_number+' · '+time(j.deploy.updated_at)+' · '+j.deploy.head_sha.slice(0,12):'No deployment run recorded'}</span></div><div className={styles.actions}><span className={styles.badge+' '+styles[dep.kind]}>{dep.text}</span>{ci.kind==='ok'&&<button className={styles.deploy} onClick={()=>run(key,'deploy')} disabled={!!busy}>{busy===key+'deploy'?'Starting…':'Deploy'}</button>}<button onClick={()=>run(key,'override-deploy')} disabled={!!busy}>{busy===key+'override-deploy'?'Starting…':'OVERRIDE DEPLOY'}</button>{j.deploy&&<a href={'/operations/run?system='+key+'&runId='+j.deploy.id}>{active[key+'deploy']===j.deploy.id?'Open live run':'View run'}</a>}</div></div>
   </article>})}</div>}
   <footer className={styles.footer}><span>Manual GitHub workflows only. Automatic Vercel Git deployments remain disabled.</span><button onClick={()=>{load();checkUpdates()}} disabled={!!busy}>Refresh</button></footer>
  </section>
 </div>
}
