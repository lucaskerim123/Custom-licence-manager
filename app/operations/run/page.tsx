'use client';
import {useCallback,useEffect,useState} from 'react';
import Link from 'next/link';
import styles from './operations-run.module.css';

function time(v?:string|null){return v?new Date(v).toLocaleString():'—'}
function duration(a?:string|null,b?:string|null){if(!a)return '—';const end=b?new Date(b).getTime():Date.now(),sec=Math.max(0,Math.floor((end-new Date(a).getTime())/1000));return sec<60?sec+'s':Math.floor(sec/60)+'m '+sec%60+'s';}
export default function RunPage(){
 const [system,setSystem]=useState('licenseManager'),[runId,setRunId]=useState(''),[data,setData]=useState<any>(null),[error,setError]=useState(''),[copied,setCopied]=useState(false),[busy,setBusy]=useState('');
 useEffect(()=>{const q=new URLSearchParams(window.location.search);setSystem(q.get('system')||'licenseManager');setRunId(q.get('runId')||'')},[]);
 const load=useCallback(async()=>{if(!system)return;try{const url='/api/operations/run?system='+encodeURIComponent(system)+(runId?'&runId='+encodeURIComponent(runId):'');const r=await fetch(url,{cache:'no-store'});const d=await r.json();if(!r.ok)throw new Error(d.error||'Unable to load workflow run.');setData(d);if(d.run?.id&&!runId)setRunId(String(d.run.id));setError('')}catch(e:any){setError(e.message||'Unable to load workflow run.')}},[system,runId]);
 useEffect(()=>{load();const t=setInterval(load,5000);return()=>clearInterval(t)},[load]);
 const running=data?.run?.status!=='completed',failed=data?.run?.conclusion==='failure';
 const status=running?'RUNNING':failed?'FAILED':data?.run?.conclusion==='success'?'PASSED':String(data?.run?.conclusion||data?.run?.status||'UNKNOWN').toUpperCase();
 async function action(kind:'ci'|'deploy'|'override-deploy'){
  if((kind==='deploy'||kind==='override-deploy')&&!window.confirm((kind==='override-deploy'?'OVERRIDE DEPLOY':'Deploy')+' '+(system==='billingStore'?'V2 Billing Store':'Custom License Manager')+'?'))return;
  setBusy(kind);setError('');
  try{const r=await fetch('/api/operations',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({job:system,action:kind})});const d=await r.json();if(!r.ok)throw new Error(d.error||'Unable to start job.');if(d.run){setRunId(String(d.run.id));setData(null);}}catch(e:any){setError(e.message||'Unable to start job.')}finally{setBusy('')}
 }
 async function copyPrompt(){if(!data?.chatPrompt)return;await navigator.clipboard.writeText(data.chatPrompt);setCopied(true);setTimeout(()=>setCopied(false),1600)}
 const label=system==='billingStore'?'V2 Billing Store':'Custom License Manager';
 return <main className={styles.main}>
  <div className={styles.top}><div><Link href="/" className={styles.back}>← License Manager</Link><div className={styles.eyebrow}>OPERATIONS / CURRENT JOB</div><h1>{label}</h1><p className={styles.muted}>Current/latest CI run · live status, controls and failure diagnostics.</p></div>
   <div className={styles.actions}><span className={styles.badge}>{status}</span>{data?.run?.html_url&&<a className={styles.linkButton} href={data.run.html_url} target="_blank" rel="noreferrer">Open GitHub</a>}</div></div>
  <section className={styles.controlBar}><div><strong>Job controls</strong><span>Run CI, deploy, or use the explicit one-shot override.</span></div><div className={styles.actions}><button onClick={()=>action('ci')} disabled={!!busy}>{busy==='ci'?'Starting…':'Run CI'}</button><button onClick={()=>action('deploy')} disabled={!!busy||data?.run?.conclusion!=='success'}>{busy==='deploy'?'Starting…':'Deploy'}</button><button onClick={()=>action('override-deploy')} disabled={!!busy}>{busy==='override-deploy'?'Starting…':'OVERRIDE DEPLOY'}</button><button onClick={load} disabled={!!busy}>Refresh</button></div></section>
  {error&&<div className={styles.error}>{error}</div>}
  <section className={styles.meta}><div><span>Repository</span><strong>{system==='billingStore'?'lucaskerim123/V2_Billing_Store':'lucaskerim123/Custom-licence-manager'}</strong></div><div><span>Run</span><strong>#{data?.run?.run_number||runId||'—'}</strong></div><div><span>Commit</span><strong>{data?.run?.head_sha||'—'}</strong></div><div><span>Updated</span><strong>{time(data?.run?.updated_at)}</strong></div></section>
  <section className={styles.card}><div className={styles.sectionHead}><div><h2>{running?'Current job output':'Latest job output'}</h2><p className={styles.muted}>{running?'Refreshing every 5 seconds while the workflow is running.':'Final workflow output.'}</p></div>{running&&<span className={styles.live}>● LIVE</span>}</div>
   {!data&&<div className={styles.loading}>Loading current/latest workflow…</div>}
   <div className={styles.jobs}>{(data?.jobs||[]).map((job:any)=><article className={styles.job} key={job.id}><div className={styles.jobHead}><div><strong>{job.name}</strong><span>{job.status} · {job.conclusion||'in progress'} · {duration(job.started_at,job.completed_at)}</span></div><span className={styles.stepBadge}>{job.conclusion==='success'?'PASSED':job.conclusion==='failure'?'FAILED':String(job.status).toUpperCase()}</span></div><div className={styles.steps}>{(job.steps||[]).map((step:any)=><div className={styles.step} key={step.name}><span>{step.conclusion==='success'?'✓':step.conclusion==='failure'?'✕':step.status==='in_progress'?'●':'○'}</span><div><b>{step.name}</b><small>{step.status}{step.conclusion?' · '+step.conclusion:''}</small></div></div>)}</div>{job.logTail&&<details className={styles.logDetails} open={job.conclusion==='failure'}><summary>{job.conclusion==='failure'?'Failed job output':'Live job output'}</summary><pre className={styles.log}>{job.logTail}</pre></details>}{job.failure&&<div className={styles.failure}><strong>Failure</strong><pre>{job.failure.lines.join('\n')}</pre></div>}</article>)}</div>
  </section>
  {data?.failure&&<section className={styles.card}><div className={styles.sectionHead}><div><h2>Failure report</h2><p className={styles.muted}>The actual error plus up to five preceding lines. Successful-step output is excluded.</p></div></div><pre className={styles.errorLog}>{data.failure.lines.join('\n')}</pre><div className={styles.prompt}><div className={styles.sectionHead}><div><h3>ChatGPT / Codex fix prompt</h3><p className={styles.muted}>Ready to copy with the error log, workflow run, repo, branch, commit and failed job.</p></div><button className={styles.linkButton} onClick={copyPrompt}>{copied?'Copied':'Copy prompt'}</button></div><pre>{data.chatPrompt}</pre></div></section>}
 </main>;
}
