'use client';
import {useActionState} from 'react';
import {runReleaseAction, type ReleaseCheck} from './[id]/actions';
const initial={ok:false,message:'',checks:[] as ReleaseCheck[]};
export default function ReleaseQueueActions({id,reviewStatus,validationStatus,published}:{id:string;reviewStatus:string;validationStatus:string;published:boolean}){
 const[state,action,pending]=useActionState(runReleaseAction,initial);
 const canReview=!published&&reviewStatus==='pending';
 return <div className="queue-actions">
  {!published&&<form action={action}><input type="hidden" name="id" value={id}/><input type="hidden" name="action" value="validate"/><button className="button" disabled={pending}>{pending?'Checking…':validationStatus==='passed'?'Re-run checks':'Validate release'}</button></form>}
  {canReview&&validationStatus==='passed'&&<form action={action}><input type="hidden" name="id" value={id}/><input type="hidden" name="action" value="approve"/><button className="button" disabled={pending}>Technical approve</button></form>}
  {canReview&&<form action={action}><input type="hidden" name="id" value={id}/><input type="hidden" name="action" value="reject"/><input className="input compact-input" name="reason" placeholder="Reject reason" required/><button className="button danger" disabled={pending}>Reject</button></form>}
  {state.message&&<div className={state.ok?'notice okBox':'notice dangerBox'}><strong>{state.message}</strong>{state.checkedAt&&<div className="muted">Checked {new Date(state.checkedAt).toLocaleString()}</div>}{state.checks?.length>0&&<details className="inline-validation" open><summary>{state.checks.filter(c=>c.ok).length}/{state.checks.length} checks passed</summary><div className="operation-checks">{state.checks.map((c,i)=><div className={c.ok?'operation-check ok':'operation-check fail'} key={c.key+i}><span>{c.ok?'✓':'×'}</span><div><strong>{c.key}</strong><div>{c.message}</div></div></div>)}</div></details>}</div>}
 </div>;
}
