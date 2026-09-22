'use client';
import {useCallback,useEffect,useState} from 'react';
import styles from './operations-run.module.css';

const systems=[
 {key:'licenseManager',label:'Custom License Manager',repo:'lucaskerim123/Custom-licence-manager'},
 {key:'billingStore',label:'V2 Billing Store',repo:'lucaskerim123/V2_Billing_Store'},
] as const;

function time(v?:string|null){return v?new Date(v).toLocaleString():'—'}
function duration(a?:string|null,b?:string|null){if(!a)return '—';const end=b?new Date(b).getTime():Date.now(),sec=Math.max(0,Math.floor((end-new Date(a).getTime())/1000));return sec<60?sec+'s':Math.floor(sec/60)+'m '+sec%60+'s'}
function status(run:any){if(!run)return 'NO RUN';if(run.status!=='completed')return 'RUNNING';return run.conclusion==='success'?'PASSED':String(run.conclusion||'FAILED').toUpperCase()}

export default function RunPage(){
 const [data,setData]=useState<Record<string,any>>({}),[error,setError]=useState(''),[busy,setBusy]=useState('');
 const load=useCallback(async()=>{
  try{
   const results=await Promise.all(systems.map(async s=>{const r=await fetch('/api/operations/run?system='+s.key,{cache:'no-store'});const d=await r.json();if(!r.ok)throw new Error(s.label+': '+(d.error||'Unable to load workflow.'));return [s.key,d] as const}));
   setData(Object.fromEntries(results));setError('');
  }catch(e:any){setError(e.message||'Unable to load workflow status.')}
 },[]);
 useEffect(()=>{load();const t=setInterval(load,5000);return()=>clearInterval(t)},[load]);

 async function action(system:string,kind:'ci'|'deploy'){
  if(kind==='deploy'&&!window.confirm('Deploy '+systems.find(s=>s.key===system)?.label+'?'))return;
  setBusy(system+kind);setError('');
  try{
   const r=await fetch('/api/operations',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({job:system,action:kind})});
   const d=await r.json();if(!r.ok)throw new Error(d.error||'Unable to start job.');
   await load();
  }catch(e:any){setError(e.message||'Unable to start job.')}finally{setBusy('')}
 }

 async function copyPrompt(prompt:string){if(!prompt)return;await navigator.clipboard.writeText(prompt)}

 return <main className={styles.main}>
  <div className={styles.top}>
   <div><div className={styles.eyebrow}>LICENSE MANAGER / OPERATIONS</div><h1>Operations</h1><p className={styles.muted}>One panel for both production systems. Scan and prepare first, then deploy the exact same main commit.</p></div>
  </div>
  {error&&<div className={styles.error}>{error}</div>}
  <section className={styles.controlBar}><div><strong>Deployment flow</strong><span>1. Scan &amp; Prepare runs the full production gate. 2. Deploy only proceeds when that exact commit has already passed.</span></div><button onClick={load} disabled={!!busy}>Refresh</button></section>
  <div className={styles.systems}>
   {systems.map(s=>{
    const d=data[s.key],run=d?.run,failed=run?.conclusion==='failure',passed=run?.status==='completed'&&run?.conclusion==='success';
    return <article className={styles.system} key={s.key}>
     <div className={styles.systemHead}><div><strong>{s.label}</strong><code>{s.repo}</code></div><span className={styles.badge}>{status(run)}</span></div>
     <div className={styles.row}><div><strong>Scan &amp; Prepare</strong><span>{run?'#'+run.run_number+' · '+time(run.updated_at)+' · '+run.head_sha.slice(0,12):'No production gate run yet'}</span></div><button onClick={()=>action(s.key,'ci')} disabled={!!busy}>{busy===s.key+'ci'?'Scanning…':'Scan & Prepare'}</button></div>
     <div className={styles.row}><div><strong>Production Deployment</strong><span>{passed?'Ready — exact commit passed Scan & Prepare.':'Blocked until Scan & Prepare passes for the current main commit.'}</span></div><button className={styles.deploy} onClick={()=>action(s.key,'deploy')} disabled={!!busy||!passed}>{busy===s.key+'deploy'?'Deploying…':'Deploy'}</button></div>
     {run&&<section className={styles.card}><div className={styles.sectionHead}><div><h2>{failed?'Failed scan output':'Latest job output'}</h2><p className={styles.muted}>{run.status==='completed'?'Final workflow output.':'Live output — refreshing every 5 seconds.'}</p></div></div>
      <div className={styles.meta}><div><span>Run</span><strong>#{run.run_number}</strong></div><div><span>Commit</span><strong>{run.head_sha}</strong></div><div><span>Updated</span><strong>{time(run.updated_at)}</strong></div></div>
      <div className={styles.jobs}>{(d?.jobs||[]).map((job:any)=><article className={styles.job} key={job.id}><div className={styles.jobHead}><div><strong>{job.name}</strong><span>{job.status} · {job.conclusion||'in progress'} · {duration(job.started_at,job.completed_at)}</span></div><span className={styles.stepBadge}>{job.conclusion==='success'?'PASSED':job.conclusion==='failure'?'FAILED':String(job.status).toUpperCase()}</span></div><div className={styles.steps}>{(job.steps||[]).map((step:any)=><div className={styles.step} key={step.name}><span>{step.conclusion==='success'?'✓':step.conclusion==='failure'?'✕':step.status==='in_progress'?'●':'○'}</span><div><b>{step.name}</b><small>{step.status}{step.conclusion?' · '+step.conclusion:''}</small></div></div>)}</div>{job.logTail&&<details className={styles.logDetails} open={job.conclusion==='failure'}><summary>{job.conclusion==='failure'?'Failed job output':'Job output'}</summary><pre className={styles.log}>{job.logTail}</pre></details>}</article>)}</div>
     </section>}
     {d?.failure&&<section className={styles.card}><div className={styles.sectionHead}><div><h2>Failure report</h2><p className={styles.muted}>Actual failure details and a ready-to-copy repair prompt.</p></div><button className={styles.linkButton} onClick={()=>copyPrompt(d.chatPrompt)}>Copy prompt</button></div><pre className={styles.errorLog}>{d.failure.lines.join('\\n')}</pre></section>}
    </article>
   })}
  </div>
 </main>
}
