"use client";
import {useEffect} from 'react';
import {useRouter} from 'next/navigation';
export default function LiveRefresh({intervalMs=5000}:{intervalMs?:number}){
  const router=useRouter();
  useEffect(()=>{
    const refresh=()=>{if(document.visibilityState==='visible')router.refresh()};
    const timer=window.setInterval(refresh,intervalMs);
    window.addEventListener('focus',refresh);document.addEventListener('visibilitychange',refresh);
    return()=>{window.clearInterval(timer);window.removeEventListener('focus',refresh);document.removeEventListener('visibilitychange',refresh)};
  },[router,intervalMs]);
  return <span className="badge" title="Release state checks automatically every few seconds.">LIVE · 5s</span>;
}
