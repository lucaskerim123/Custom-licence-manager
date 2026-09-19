'use client';

import { useActionState } from 'react';
import { runReleaseAction } from './actions';

const initial = { ok: false, message: '' };

export default function ReleaseControls({ id, reviewStatus, validationStatus, published }: { id: string; reviewStatus: string; validationStatus: string; published: boolean }) {
  const [state, action, pending] = useActionState(runReleaseAction, initial);
  const canReview = !published && reviewStatus === 'pending';
  return <div className="release-controls">
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="action" value="validate" />
      <button className="button" disabled={pending || published}>{pending ? 'Working…' : validationStatus === 'passed' ? 'Re-run validation' : 'Run full validation'}</button>
    </form>
    {canReview && validationStatus === 'passed' && <form action={action}>
      <input type="hidden" name="id" value={id} /><input type="hidden" name="action" value="approve" />
      <button className="button" disabled={pending}>Technical approve</button>
    </form>}
    {canReview && <form action={action} onSubmit={(e) => { if (!window.confirm('Reject this release? A rejection reason is required.')) e.preventDefault(); }}>
      <input type="hidden" name="id" value={id} /><input type="hidden" name="action" value="reject" />
      <input className="input" name="reason" placeholder="Rejection reason" required aria-label="Rejection reason" />
      <button className="button danger" disabled={pending}>Reject</button>
    </form>}
    {!published && <form action={action} onSubmit={(e) => { if (!window.confirm('Archive this release candidate?')) e.preventDefault(); }}>
      <input type="hidden" name="id" value={id} /><input type="hidden" name="action" value="archive" />
      <button className="button secondary" disabled={pending}>Archive</button>
    </form>}
    {state.message && <div className={state.ok ? 'notice okBox' : 'notice dangerBox'} aria-live="polite">{state.message}</div>}
  </div>;
}
