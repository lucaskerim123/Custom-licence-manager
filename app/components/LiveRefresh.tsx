"use client";
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LiveRefresh({ intervalMs = 5000 }: { intervalMs?: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const refresh = () => { if (document.visibilityState === 'visible' && !busy) router.refresh(); };
    const timer = window.setInterval(refresh, intervalMs);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh); };
  }, [router, intervalMs, busy]);
  return <div className="live-control"><span className="live-dot-indicator" aria-hidden="true"></span><span>Live</span><button className="live-refresh-button" type="button" onClick={() => { setBusy(true); router.refresh(); window.setTimeout(() => setBusy(false), 500); }}>{busy ? 'Checking…' : 'Refresh'}</button></div>;
}