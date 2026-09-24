"use client";
import {useEffect,useRef,useState} from 'react';
import {useRouter} from 'next/navigation';

export default function LiveRefresh({intervalMs=8000}:{intervalMs?:number}){
 const router=useRouter();
 const lastSyncRef=useRef(Date.now());
 const [busy,setBusy]=useState(false);
 const [seconds,setSeconds]=useState(0);

 useEffect(()=>{
  const markSynced=()=>{lastSyncRef.current=Date.now();setSeconds(0)};
  const refresh=()=>{if(document.visibilityState==='visible'){router.refresh();markSynced()}};
  const timer=window.setInterval(refresh,intervalMs);
  const tick=window.setInterval(()=>setSeconds(Math.floor((Date.now()-lastSyncRef.current)/1000)),1000);
  window.addEventListener('focus',refresh);
  document.addEventListener('visibilitychange',refresh);
  return()=>{clearInterval(timer);clearInterval(tick);window.removeEventListener('focus',refresh);document.removeEventListener('visibilitychange',refresh)};
 },[router,intervalMs]);

 const manual=()=>{
  setBusy(true);
  router.refresh();
  lastSyncRef.current=Date.now();
  setSeconds(0);
  window.setTimeout(()=>setBusy(false),600);
 };

 const syncLabel=seconds<2?'now':`${seconds}s`;
 return <div className="live-control">
  <span className="live-dot-indicator"/>
  <span className="live-label">Live <span className="muted">· synced <span className="live-age">{syncLabel}</span></span></span>
  <button className="live-refresh-button" onClick={manual} disabled={busy}>{busy?'Syncing…':'Refresh'}</button>
 </div>;
}
