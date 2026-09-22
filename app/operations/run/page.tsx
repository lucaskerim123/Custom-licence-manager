'use client';
import {useCallback,useEffect,useMemo,useState} from 'react';
import styles from './operations-run.module.css';

const systems=[
 {key:'licenseManager',label:'Custom License Manager',repo:'lucaskerim123/Custom-licence-manager'},
 {key:'billingStore',label:'V2 Billing Store',repo:'lucaskerim123/V2_Billing_Store'},
] as const;

function time(v?:string|null){return v?new Date(v).toLocaleString():'—'}
function duration(a?:string|null,b?:string|null){if(!a)return '—';const end=b?new Date(b).getTime():Date.now(),sec=Math.max(0,Math.floor((end-new Date(a).getTime())/1000));return sec<60?sec+'s':Math.floor(sec/60)+'m '+sec%60+'s'}
function status(run:any){if(!run)return 'NO RUN';if(run.status!=='completed')return 'LIVE';return run.conclusion==='success'?'PASSED':run.conclusion==='cancelled'?'CANCELLED':String(run.conclusion||'FAILED').toUpperCase()}
function kind(run:any){if(!run)return 'neutral';if(run.status!=='completed')return 'running';return run.conclusion==='success'?'ok':run.conclusion==='cancelled'?'neutral':'bad'}

export default function RunPage(){
 const [data,setData]=useState<Record<string,any>>({}),[error,setError]=useState(''),[busy,setBusy]=useState('');
 const [collapsed,setCollapsed]=useState<Record<string,boolean>>({billingStore:false});
 const [consoleOpen,setConsoleOpen]=useState<Record<string,boolean>>({licenseManager:true,billingStore:true});
 const [lastRefresh,setLastRefresh]=useState('');
 const load=useCallback(async()=>{
  try{
   const results=await Promise.all(systems.map(async s=>{const r=await fetch('/api/operations/run?system='+s.key,{cache:'no-store'});const d=await r.json();if(!r.ok)throw new Error(s.label+': '+(d.error||'Unable to load workflow.'));return [s.key,d] as const}));
   setData(Object.fromEntries(results));setError('');setLastRefresh(new Date().toISOString());
  }catch(e:any){setError(e.message||'Unable to load workflow status.')}
 },[]);
 useEffect(()=>{load()},[load]);
 const live=useMemo(()=>systems.some(s=>data[s.key]?.run?.status&&data[s.key].run.status!=='completed'),[data]);
 useEffect(()=>{const t=setInterval(load,live?3000:15000);return()=>clearInterval(t)},[live,load]);

 async function action(system:string,kind:'ci'|'deploy'|'override-deploy'){
  if((kind==='deploy'||kind==='override-deploy')&&!window.confirm((kind==='override-deploy'?'OVERRIDE DEPLOY ':'Deploy ')+systems.find(s=>s.key===system)?.label+'?'))return;
  setBusy(system+kind);setError('');
  try{const r=await fetch('/api/operations',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({job:system,action:kind})});const d=await r.json();if(!r.ok)throw new Error(d.error||'Unable to start job.');await load();setConsoleOpen(p=>({...p,[system]:true}))}
  catch(e:any){setError(e.message||'Unable to start job.')}finally{setBusy('')}
 }
 async function copyPrompt(prompt:string){if(!prompt)return;await navigator.clipboard.writeText(prompt)}

 return <div className={styles.content}>
  <header className={styles.top}>
   <div><div className={styles.eyebrow}>LICENSE MANAGER / OPERATIONS</div><h1>Operations</h1><p className={styles.muted}>Production control for both systems. Scan and prepare the exact main commit, monitor it live, then deploy manually.</p></div>
   <div className={styles.liveHeader}><span className={styles.liveDot}/>{live?'LIVE MONITORING':'STATUS MONITOR'}<small>{lastRefresh?'Updated '+time(lastRefresh):'Connecting…'}</small></div>
  </header>
  {error&&<div className={styles.error}>{error}</div>}
  <section className={styles.controlBar}><div><strong>Manual deployment control</strong><span>No automatic Vercel deployment is triggered. Scan &amp; Prepare validates the commit; Deploy runs only from this panel.</span></div><button onClick={load} disabled={!!busy}>{live?'Refresh now':'Refresh'}</button></section>
  <div className={styles.systems}>
   {systems.map(s=>{const d=data[s.key],run=d?.run,passed=run?.status==='completed'&&run?.conclusion==='success',isCollapsed=!!collapsed[s.key],isConsoleOpen=consoleOpen[s.key]!==false;
    return <article className={styles.system} key={s.key}>
     <button className={styles.systemToggle} onClick={()=>setCollapsed(p=>({...p,[s.key]:!p[s.key]}))} aria-expanded={!isCollapsed}>
      <span><strong>{s.label}</strong><code>{s.repo}</code></span><span className={styles.headStatus}><span className={styles.badge+' '+styles[kind(run)]}>{status(run)}</span><span className={styles.chevron}>{isCollapsed?'▸':'▾'}</span></span>
     </button>
     {!isCollapsed&&<div className={styles.systemBody}>
      <div className={styles.row}><div><strong>Scan &amp; Prepare</strong><span>{run?'#'+run.run_number+' · '+time(run.updated_at)+' · '+run.head_sha.slice(0,12):'No production gate run yet'}</span></div><button className={styles.primaryAction} onClick={()=>action(s.key,'ci')} disabled={!!busy}>{busy===s.key+'ci'?'Scanning…':'Scan & Prepare'}</button></div>
      <div className={styles.row}><div><strong>Production Deployment</strong><span>{passed?'Ready — exact commit passed Scan &amp; Prepare.':'Blocked until the exact current commit passes Scan &amp; Prepare.'}</span></div><div className={styles.actions}><button className={styles.deploy} onClick={()=>action(s.key,'deploy')} disabled={!!busy||!passed}>{busy===s.key+'deploy'?'Deploying…':'Deploy'}</button><button onClick={()=>action(s.key,'override-deploy')} disabled={!!busy}>{busy===s.key+'override-deploy'?'Starting…':'Override'}</button></div></div>
      {d?.latestDeployment&&<div className={styles.latestDeployment}><strong>Latest production deployment</strong><span>#{d.latestDeployment.run_number} · {status(d.latestDeployment)} · {time(d.latestDeployment.updated_at)} · {d.latestDeployment.head_sha.slice(0,12)}</span><a href={d.latestDeployment.html_url} target="_blank" rel="noreferrer">GitHub</a></div>}
      {run&&<section className={styles.consoleCard}>
       <button className={styles.consoleHeader} onClick={()=>setConsoleOpen(p=>({...p,[s.key]:!isConsoleOpen}))} aria-expanded={isConsoleOpen}><span><strong>LIVE CONSOLE</strong><small>{run.status==='completed'?'Final output':'Streaming workflow status · refreshes every '+(live?'3':'15')+' seconds'}</small></span><span className={styles.consoleIndicator}>{run.status==='completed'?'● CLOSED':'● LIVE'} {isConsoleOpen?'▾':'▸'}</span></button>
       {isConsoleOpen&&<div className={styles.consoleBody}>
        <div className={styles.meta}>{[['Run','#'+run.run_number],['Commit',run.head_sha],['Updated',time(run.updated_at)],['State',status(run)]].map(([a,b])=><div key={a}><span>{a}</span><strong>{b}</strong></div>)}</div>
        <div className={styles.jobs}>{(d?.jobs||[]).map((job:any)=><article className={styles.job} key={job.id}>
         <div className={styles.jobHead}><div><strong>{job.name}</strong><span>{job.status} · {job.conclusion||'in progress'} · {duration(job.started_at,job.completed_at)}</span></div><span className={styles.stepBadge}>{job.conclusion==='success'?'PASSED':job.conclusion==='failure'?'FAILED':String(job.status).toUpperCase()}</span></div>
         <div className={styles.steps}>{(job.steps||[]).map((step:any)=><div className={styles.step} key={step.name}><span>{step.conclusion==='success'?'✓':step.conclusion==='failure'?'✕':step.status==='in_progress'?'●':'○'}</span><div><b>{step.name}</b><small>{step.status}{step.conclusion?' · '+step.conclusion:''}</small></div></div>)}</div>
         {job.logTail&&<details className={styles.logDetails} open={job.conclusion==='failure'}><summary>{job.conclusion==='failure'?'Failed output':'Console output'}</summary><pre className={styles.log}>{job.logTail}</pre></details>}
        </article>)}</div>
       </div>}
      </section>}
      {d?.failure&&<details className={styles.errorPanel}><summary><div><h2>Failure report</h2><p className={styles.muted}>{d.failure.lines.length} captured error/context lines.</p></div></summary><div className={styles.errorBody}><pre className={styles.errorLog}>{d.failure.lines.join('\n')}</pre>{d.chatPrompt&&<div className={styles.prompt}><div className={styles.sectionHead}><div><h3>ChatGPT / Codex repair prompt</h3><p className={styles.muted}>Includes the run, failed job, commit and captured errors.</p></div><button className={styles.linkButton} onClick={()=>copyPrompt(d.chatPrompt)}>Copy prompt</button></div><pre>{d.chatPrompt}</pre></div>}</div></details>}
     </div>}
    </article>})}
  </div>
 </main>
}
