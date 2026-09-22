'use client';
import {useCallback,useEffect,useState} from 'react';
import Link from 'next/link';
import {useSearchParams} from 'next/navigation';
import styles from './operations-run.module.css';
function time(v?:string|null){return v?new Date(v).toLocaleString():'—'}
function duration(a?:string|null,b?:string|null){if(!a)return '—';const end=b?new Date(b).getTime():Date.now(),sec=Math.max(0,Math.floor((end-new Date(a).getTime())/1000));return sec<60?sec+'s':Math.floor(sec/60)+'m '+sec%60+'s';}
export default function RunPage(){
 const q=useSearchParams(),system=q.get('system')||'licenseManager',runId=q.get('runId')||'';
 const [data,setData]=useState<any>(null),[error,setError]=useState(''),[copied,setCopied]=useState(false);
 const load=useCallback(async()=>{if(!runId)return;try{const r=await fetch('/api/operations/run?system='+encodeURIComponent(system)+'&runId='+encodeURIComponent(runId),{cache:'no-store'});const d=await r.json();if(!r.ok)throw new Error(d.error||'Unable to load workflow run.');setData(d);setError('')}catch(e:any){setError(e.message||'Unable to load workflow run.')}},[system,runId]);
 useEffect(()=>{load();const t=setInterval(load,5000);return()=>clearInterval(t)},[load]);
 const running=data?.run?.status!=='completed',failed=data?.run?.conclusion==='failure';
 const status=running?'RUNNING':failed?'FAILED':data?.run?.conclusion==='success'?'PASSED':String(data?.run?.conclusion||data?.run?.status||'UNKNOWN').toUpperCase();
 async function copyPrompt(){if(!data?.chatPrompt)return;await navigator.clipboard.writeText(data.chatPrompt);setCopied(true);setTimeout(()=>setCopied(false),1600)}
 if(!runId)return <main className={styles.main}><p>Missing workflow run.</p></main>;
 return <main className={styles.main}>
  <div className={styles.top}><div><Link href="/" className={styles.back}>← License Manager</Link><div className={styles.eyebrow}>OPERATIONS / WORKFLOW RUN</div><h1>{data?.run?.name||'Workflow run'}</h1><p className={styles.muted}>Run #{data?.run?.run_number||runId} · {time(data?.run?.created_at)} · <code>{data?.run?.head_sha?.slice(0,12)}</code></p></div><div className={styles.actions}><span className={styles.badge}>{status}</span>{data?.run?.html_url&&<a className={styles.linkButton} href={data.run.html_url} target="_blank" rel="noreferrer">Open GitHub</a>}</div></div>
  {error&&<div className={styles.error}>{error}</div>}
  <section className={styles.meta}><div><span>Repository</span><strong>{system==='billingStore'?'V2_Billing_Store':'Custom-licence-manager'}</strong></div><div><span>Commit</span><strong>{data?.run?.head_sha}</strong></div><div><span>Started</span><strong>{time(data?.run?.created_at)}</strong></div><div><span>Updated</span><strong>{time(data?.run?.updated_at)}</strong></div></section>
  <section className={styles.card}><div className={styles.sectionHead}><div><h2>Live job output</h2><p className={styles.muted}>{running?'Refreshing every 5 seconds while the workflow is running.':'Final workflow output.'}</p></div>{running&&<span className={styles.live}>● LIVE</span>}</div>
   <div className={styles.jobs}>{(data?.jobs||[]).map((job:any)=><article className={styles.job} key={job.id}><div className={styles.jobHead}><div><strong>{job.name}</strong><span>{job.status} · {job.conclusion||'in progress'} · {duration(job.started_at,job.completed_at)}</span></div><span className={styles.stepBadge}>{job.conclusion==='success'?'PASSED':job.conclusion==='failure'?'FAILED':String(job.status).toUpperCase()}</span></div><div className={styles.steps}>{(job.steps||[]).map((step:any)=><div className={styles.step} key={step.name}><span>{step.conclusion==='success'?'✓':step.conclusion==='failure'?'✕':step.status==='in_progress'?'●':'○'}</span><div><b>{step.name}</b><small>{step.status}{step.conclusion?' · '+step.conclusion:''}</small></div></div>)}</div>{job.failure&&<div className={styles.failure}><strong>Failure</strong><pre>{job.failure.lines.join('\n')}</pre></div>}</article>)}</div>
  </section>
  {data?.failure&&<section className={styles.card}><div className={styles.sectionHead}><div><h2>Failure report</h2><p className={styles.muted}>Only the failure and up to five preceding lines are shown.</p></div></div><pre className={styles.errorLog}>{data.failure.lines.join('\n')}</pre><div className={styles.prompt}><div className={styles.sectionHead}><div><h3>ChatGPT / Codex fix prompt</h3><p className={styles.muted}>Includes the exact error, workflow job, repository, branch, commit and run context.</p></div><button className={styles.linkButton} onClick={copyPrompt}>{copied?'Copied':'Copy prompt'}</button></div><pre>{data.chatPrompt}</pre></div></section>}
 </main>;
}
