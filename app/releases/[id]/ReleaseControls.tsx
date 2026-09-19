'use client';
import {useActionState} from 'react';
import {runReleaseAction, type ReleaseCheck} from './actions';
const initial={ok:false,message:'',checks:[] as ReleaseCheck[]};
export default function ReleaseControls({id,reviewStatus,validationStatus,published}:{id:string;reviewStatus:string;validationStatus:string;published:boolean}){
 const[state,action,pending]=useActionState(runReleaseAction,initial);
 const canReview=!published&&reviewStatus==='pending';
 return <div className="release-controls">
  <form action={action}><input type="hidden" name="id" value={id}/><input type="hidden" name="action" value="validate"/><button className="button" disabled={pending||published}>{pending?'Running checks…':validationStatus==='passed'?'Re-run full validation':'Run full validation'}</button></form>
  {canReview&&validationStatus==='passed'&&<form action={action}><input type="hidden" name="id" value={id}/><input type="hidden" name="action" value="approve"/><button className="button" disabled={pending}>Technical approve</button></form>}
  {canReview&&<form action={action}><input type="hidden" name="id" value={id}/><input type="hidden" name="action" value="reject"/><input className="input compact-input" name="reason" placeholder="Rejection reason" required/><button className="button danger" disabled={pending}>Reject</button></form>}
  {!published&&<form action={action}><input type="hidden" name="id" value={id}/><input type="hidden" name="action" value="archive"/><button className="button secondary" disabled={pending}>Archive</button></form>}
  {state.message&&<div className={state.ok?'notice okBox':'notice dangerBox'} aria-live="polite"><strong>{state.message}</strong>{state.checkedAt&&<div className="muted">Checked {new Date(state.checkedAt).toLocaleString()}</div>}{state.checks?.length>0&&<div className="operation-checks">{state.checks.map((c,i)=><div className={c.ok?'operation-check ok':'operation-check fail'} key={c.key+i}><span>{c.ok?'✓':'×'}</span><div><strong>{c.key}</strong><div>{c.message}</div></div></div>)}</div>}</div>}
 </div>;
}
