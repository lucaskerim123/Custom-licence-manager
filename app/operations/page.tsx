'use client';
import {useCallback,useEffect,useState} from 'react';
import styles from './operations.module.css';

type Run={id:number;status:string;conclusion:string|null;run_number:number;head_sha:string;created_at:string;updated_at:string;html_url:string;name:string}|null;
type Job={repo:string;label:string;ci:Run;deploy:Run};
type Jobs=Record<'licenseManager'|'billingStore',Job>;
function state(run:Run){if(!run)return{text:'NO RUN',kind:'neutral'};if(run.status!=='completed')return{text:run.status.toUpperCase(),kind:'running'};if(run.conclusion==='success')return{text:'PASSED',kind:'ok'};if(run.conclusion==='cancelled')return{text:'CANCELLED',kind:'neutral'};return{text:'FAILED',kind:'bad'}}
function time(value?:string){return value?new Date(value).toLocaleString():'—'}
export default function Operations(){
 const [jobs,setJobs]=useState<Jobs|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState('');
 const load=useCallback(async()=>{try{const r=await fetch('/api/operations',{cache:'no-store'});const d=await r.json();if(!r.ok)throw new Error(d.error||'Unable to load job status.');setJobs(d.jobs);setError('')}catch(e:any){setError(e.message||'Unable to load job status.')}},[]);
 useEffect(()=>{load()},[load]);
 useEffect(()=>{
  if(!jobs)return;
  const running=Object.values(jobs).some(j=>j.ci?.status!=='completed'||j.deploy?.status!=='completed');
  if(!running)return;
  const t=setInterval(load,15000);
  return()=>clearInterval(t);
 },[jobs,load]);
 async function run(job:'licenseManager'|'billingStore',action:'ci'|'deploy'){
  if(action==='deploy'&&!window.confirm('Start the production deployment workflow for '+jobs?.[job].label+'?\\n\\nThe workflow still performs its production preflight and requires the explicit DEPLOY input.'))return;
  setBusy(job+action);setError('');
  try{const r=await fetch('/api/operations',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({job,action})});const d=await r.json();if(!r.ok)throw new Error(d.error||'Unable to start job.');await load()}catch(e:any){setError(e.message||'Unable to start job.')}finally{setBusy('')}
 }
 return <div className={styles.page}>
  <div className={styles.hero}><div><div className={styles.eyebrow}>SYSTEM / OPERATIONS</div><h1>Release & Deployment Operations</h1><p>One control point for the two active production systems. GitHub Actions remains the builder and deployment executor.</p></div><button className={styles.refresh} onClick={load} disabled={!!busy}>Refresh status</button></div>
  {error&&<div className={styles.error}><strong>Operation error</strong><span>{error}</span></div>}
  {!jobs&&!error&&<div className={styles.loading}>Loading GitHub status…</div>}
  {jobs&&<div className={styles.cards}>{(['licenseManager','billingStore'] as const).map(key=>{const j=jobs[key],ci=state(j.ci),dep=state(j.deploy);return <section className={styles.card} key={key}>
   <div className={styles.cardHead}><div><div className={styles.eyebrow}>REPOSITORY</div><h2>{j.label}</h2><code>{j.repo}</code></div><span className={styles.badge+' '+styles[ci.kind]}>CI {ci.text}</span></div>
   <div className={styles.job}><div className={styles.jobInfo}><strong>CI / Production Preflight</strong><span>Last run {j.ci?'#'+j.ci.run_number+' · '+time(j.ci.updated_at):'No run recorded'}</span>{j.ci&&<code>{j.ci.head_sha.slice(0,12)}</code>}</div><div className={styles.actions}><button onClick={()=>run(key,'ci')} disabled={!!busy}>{busy===key+'ci'?'Starting…':'Run CI'}</button>{j.ci?.html_url&&<a href={j.ci.html_url} target="_blank" rel="noreferrer">Logs</a>}</div></div>
   <div className={styles.job}><div className={styles.jobInfo}><strong>Production</strong><span>Last run {j.deploy?'#'+j.deploy.run_number+' · '+time(j.deploy.updated_at):'No deployment run recorded'}</span></div><div className={styles.actions}><span className={styles.badge+' '+styles[dep.kind]}>{dep.text}</span><button className={styles.deploy} onClick={()=>run(key,'deploy')} disabled={!!busy}>{busy===key+'deploy'?'Starting…':'Manual Deploy'}</button>{j.deploy?.html_url&&<a href={j.deploy.html_url} target="_blank" rel="noreferrer">Logs</a>}</div></div>
  </section>})}</div>}
  <div className={styles.note}><strong>Deployment safety</strong><span>This page never deploys from Vercel directly. It dispatches the existing manual GitHub production workflow, which checks out <code>main</code>, runs the complete preflight, builds the exact production artifact, and then deploys it.</span></div>
 </div>
}
