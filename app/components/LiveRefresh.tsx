"use client";
import {useEffect,useState} from 'react';
import {useRouter} from 'next/navigation';

export default function LiveRefresh({intervalMs=8000}:{intervalMs?:number}){
 const router=useRouter(); const [busy,setBusy]=useState(false); const [lastSync,setLastSync]=useState(Date.now()); const [seconds,setSeconds]=useState(0);
 useEffect(()=>{
  const refresh=()=>{if(document.visibilityState==='visible'){router.refresh();setLastSync(Date.now());}};
  const timer=window.setInterval(refresh,intervalMs);
  const tick=window.setInterval(()=>setSeconds(Math.floor((Date.now()-lastSync)/1000)),1000);
  window.addEventListener('focus',refresh); document.addEventListener('visibilitychange',refresh);
  return()=>{clearInterval(timer);clearInterval(tick);window.removeEventListener('focus',refresh);document.removeEventListener('visibilitychange',refresh)};
 },[router,intervalMs,lastSync]);
 const manual=()=>{setBusy(true);router.refresh();setLastSync(Date.now());window.setTimeout(()=>setBusy(false),600)};
 return <div className="live-control"><span className="live-dot-indicator"/><span>Live <span className="muted">· synced {seconds<2?'just now':seconds+'s ago'}</span></span><button className="live-refresh-button" onClick={manual}>{busy?'Syncing…':'Refresh'}</button></div>
}
