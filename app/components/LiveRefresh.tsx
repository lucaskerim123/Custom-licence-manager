"use client";
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LiveRefresh({ intervalMs = 5000 }: { intervalMs?: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === 'visible') router.refresh();
    };
    const timer = window.setInterval(refresh, intervalMs);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [router, intervalMs]);

  const manualRefresh = () => {
    setBusy(true);
    router.refresh();
    window.setTimeout(() => setBusy(false), 700);
  };

  return <div className="live-control" role="status" aria-live="polite">
    <span className="live-dot-indicator" aria-hidden="true"></span>
    <span>Live · updates every {Math.round(intervalMs / 1000)}s</span>
    <button className="live-refresh-button" type="button" onClick={manualRefresh}>
      {busy ? 'Checking…' : 'Refresh'}
    </button>
  </div>;
}