import Link from 'next/link';
import { requireUser } from '../../../lib/session';
import { db } from '../../../lib/db';
import SideNav from '../../components/SideNav';
import LiveRefresh from '../../components/LiveRefresh';
import ReleaseControls from './ReleaseControls';

export const dynamic = 'force-dynamic';

export default async function ReleaseDetail({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const result = await db().query(`select r.*,p.slug product,p.name product_name from releases r join products p on p.id=r.product_id where r.id=$1 limit 1`, [id]);
  const release: any = result.rows[0];
  if (!release) return <div className="shell"><SideNav /><main className="main"><h1 className="title">Release not found</h1><Link href="/releases">Back to releases</Link></main></div>;
  const validation = release.manifest?.validation || {};
  const checks = Array.isArray(validation.checks) ? validation.checks : [];
  const manifest = release.manifest || {};
  const passed = checks.filter((c:any) => c.ok).length;
  const failed = checks.length - passed;
  const audit = (await db().query(`select id,actor,action,details,created_at from audit_events where resource_type='release' and resource_id=$1 order by created_at desc limit 25`, [id])).rows;
  const isBase = release.release_type === 'base';
  const pipeline = [
    ['Build', Boolean(release.source_sha && release.artifact_url)],
    ['Intake', true],
    ['Validate', validation.status === 'passed'],
    ['Technical approval', release.review_status === 'approved'],
    ['Billing Store', release.status === 'published' || release.review_status === 'approved'],
  ];
  return <div className="shell">
    <SideNav active={isBase ? 'base' : 'releases'} />
    <main className="main release-main">
      <LiveRefresh />
      <div className="top">
        <div><Link href={isBase ? '/releases/base' : '/releases'} className="muted">← Back to queue</Link><h1 className="title" style={{marginTop:8}}>{release.product_name || release.product} {release.version}</h1><p className="muted">{release.release_type.toUpperCase()} · {release.channel} · {release.id}</p></div>
        <div className="actions"><span className="badge">{release.status}</span><span className={validation.status==='passed'?'badge ok':'badge off'}>{validation.status || 'not run'}</span><span className="badge">review {release.review_status}</span></div>
      </div>

      <section className="card" style={{marginBottom:14}}>
        <div className="muted" style={{textTransform:'uppercase',letterSpacing:'.07em',fontSize:12}}>Release pipeline</div>
        <div className="release-detail-pipeline">{pipeline.map(([label,done],i)=><div className={done?'pipeline-node done':'pipeline-node'} key={String(label)}><span>{done?'✓':String(i+1).padStart(2,'0')}</span><strong>{label}</strong></div>)}</div>
      </section>

      <div className="detail-grid">
        <section className="card">
          <h2>Operations</h2>
          <p className="muted">Actions run through the License Manager authority and are recorded in the audit log.</p>
          <ReleaseControls id={release.id} reviewStatus={release.review_status} validationStatus={validation.status || 'not run'} published={release.status === 'published'} />
        </section>
        <section className="card">
          <h2>Validation</h2>
          <div className="validation-summary"><strong>{passed}</strong><span>passed</span><strong>{failed}</strong><span>failed</span><span className="muted">{validation.checked_at ? new Date(validation.checked_at).toLocaleString() : 'Not run yet'}</span></div>
          {checks.length ? <div className="check-list">{checks.map((c:any,i:number)=><div className={c.ok?'check-row ok':'check-row fail'} key={c.key || i}><span>{c.ok?'✓':'×'}</span><div><strong>{c.key || 'check'}</strong><div className="muted">{c.message}</div></div></div>)}</div> : <div className="notice">No validation has been run yet.</div>}
        </section>
      </div>

      <div className="detail-grid" style={{marginTop:14}}>
        <section className="card"><h2>Release record</h2><div className="record-grid">
          <div><small className="muted">Source</small><div>{release.source_repo || '—'} @ {release.source_ref || '—'}</div></div>
          <div><small className="muted">Commit</small><div className="mono">{release.source_sha || '—'}</div></div>
          <div><small className="muted">Artifact</small><div>{release.artifact_name || '—'}</div></div>
          <div><small className="muted">SHA-256</small><div className="mono">{release.checksum || '—'}</div></div>
          <div><small className="muted">CI run</small><div>{release.artifact_run_id || '—'}</div></div>
          <div><small className="muted">Billing Store handoff</small><div>{release.customer_publication_repo || 'V2_Billing_Store'} · {release.review_status === 'approved' ? 'ready' : 'blocked'}</div></div>
        </div><h3>Changelog</h3><div className="notice" style={{whiteSpace:'pre-wrap'}}>{release.notes || 'No changelog supplied.'}</div></section>
        <section className="card"><h2>Manifest</h2><div className="manifest-list"><div><small className="muted">Components</small><div>{(manifest.components || []).join(', ') || '—'}</div></div><div><small className="muted">Minimum version</small><div>{manifest.minimum_version || '—'}</div></div><div><small className="muted">Rollback</small><div>{manifest.rollback_version || 'Not specified'}</div></div><div><small className="muted">Revision</small><div>{release.revision}</div></div></div><details style={{marginTop:12}}><summary>Raw manifest</summary><pre className="code-panel">{JSON.stringify(manifest,null,2)}</pre></details></section>
      </div>

      <section className="card" style={{marginTop:14}}><h2>Audit trail</h2>{audit.length ? <div className="audit-list">{audit.map((a:any)=><div className="audit-row" key={a.id}><div><strong>{a.action}</strong><div className="muted">{a.actor}</div></div><div className="muted">{new Date(a.created_at).toLocaleString()}</div><pre className="audit-details">{JSON.stringify(a.details)}</pre></div>)}</div> : <p className="muted">No audit events recorded.</p>}</section>
    </main>
  </div>;
}
