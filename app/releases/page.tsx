import Link from 'next/link';
import { revalidatePath } from 'next/cache';
import { requireUser } from '../../lib/session';
import { listReleases, setReleaseReview, validateRelease } from '../../lib/core/releases';
import SideNav from '../components/SideNav';
import LiveRefresh from '../components/LiveRefresh';

export const dynamic = 'force-dynamic';
const roles = ['owner', 'admin', 'operator'];

async function validate(formData: FormData) {
  'use server';
  const u = await requireUser();
  if (!roles.includes(u.role)) return;
  const id = String(formData.get('id') || '');
  if (id) {
    await validateRelease(id, u.id, u.email);
    revalidatePath('/releases');
  }
}

async function review(formData: FormData) {
  'use server';
  const u = await requireUser();
  if (!roles.includes(u.role)) return;
  const id = String(formData.get('id') || '');
  const decision = String(formData.get('decision') || '');
  if (id && (decision === 'approved' || decision === 'rejected')) {
    await setReleaseReview(id, decision, u.id, u.email);
    revalidatePath('/releases');
  }
}

function validationSummary(r: any) {
  const v = r.manifest?.validation;
  return { status: v?.status || 'not run', checks: Array.isArray(v?.checks) ? v.checks : [] };
}

function metric(label: string, value: number, detail: string) {
  return <section className="card" style={{ minHeight: 92 }}>
    <div className="muted">{label}</div>
    <strong style={{ display: 'block', fontSize: 28, marginTop: 5 }}>{value}</strong>
    <small className="muted">{detail}</small>
  </section>;
}

export default async function Releases() {
  const releases = (await listReleases()).filter((r: any) => r.release_type === 'update');
  const pending = releases.filter((r: any) => r.review_status === 'pending').length;
  const approved = releases.filter((r: any) => r.review_status === 'approved' && r.status !== 'published').length;
  const published = releases.filter((r: any) => r.status === 'published').length;
  const attention = releases.filter((r: any) => {
    const v = validationSummary(r);
    return v.status === 'failed' || r.review_status === 'rejected';
  }).length;

  return <div className="shell">
    <SideNav active="releases" />
    <main className="main">
      <LiveRefresh />
      <header className="card" style={{ marginBottom: 14, padding: 22 }}>
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start', gap: 18 }}>
          <div>
            <div className="muted" style={{ textTransform: 'uppercase', letterSpacing: '.08em' }}>Release workspace</div>
            <h1 className="title" style={{ marginBottom: 7 }}>Release Updates</h1>
            <p className="muted" style={{ maxWidth: 760, margin: 0 }}>
              V1-vercel-engine builds update candidates for MCP, APEX and Studio. License Manager owns technical validation and approval; Billing Store owns final customer-facing publication.
            </p>
          </div>
          <span className="badge">ENGINE UPDATES</span>
        </div>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 11, marginBottom: 14 }}>
        {metric('Open candidates', pending, 'Awaiting technical review')}
        {metric('Needs attention', attention, 'Failed validation or rejected')}
        {metric('Technically approved', approved, 'Ready for Billing Store')}
        {metric('Published', published, 'Customer-facing releases')}
      </div>

      <section className="card" style={{ marginBottom: 14, padding: 18 }}>
        <div className="muted" style={{ textTransform: 'uppercase', letterSpacing: '.07em', fontSize: 12 }}>Pipeline</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8, marginTop: 12 }}>
          {['Detect changes', 'Build package', 'License intake', 'Technical approve', 'Billing publish'].map((step, i) =>
            <div key={step} className="release-pipeline-step">
              <small className="muted">0{i + 1}</small><strong style={{ display: 'block', marginTop: 4 }}>{step}</strong>
            </div>
          )}
        </div>
      </section>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 290px', gap: 14, alignItems: 'start' }}>
        <section className="card" style={{ padding: 18 }}>
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <div><h2 style={{ margin: 0 }}>Incoming update candidates</h2><p className="muted" style={{ margin: '5px 0 0' }}>Candidates arrive from V1-vercel-engine. Manual candidate creation is disabled here.</p></div>
            <span className="badge">{releases.length} total</span>
          </div>
          {releases.length === 0 ? <p className="muted" style={{ marginTop: 18 }}>No Engine update candidates yet.</p> :
            <div style={{ display: 'grid', gap: 11, marginTop: 16 }}>
              {releases.map((r: any) => {
                const v = validationSummary(r);
                return <article key={r.id} className="release-item">
                  <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                    <div>
                      <div style={{ display: 'flex', gap: 7, alignItems: 'center', flexWrap: 'wrap' }}>
                        <Link href={'/releases/' + r.id} className="release-title-link"><strong style={{ fontSize: 17 }}>{r.product_name || r.product || 'OrbitFS Update'} {r.version}</strong></Link>
                        <span className="badge">{r.channel}</span><span className="badge">{r.status}</span><span className="badge">review {r.review_status}</span><span className="badge">validation {v.status}</span>
                      </div>
                      <p className="muted" style={{ margin: '7px 0 0' }}>Components: {(r.manifest?.components || []).join(', ') || '—'} · {r.source_repo || '—'} @ {r.source_ref || '—'}</p>
                    </div>
                    <div className="actions">
                      {r.status !== 'published' && <form action={validate}><input type="hidden" name="id" value={r.id} /><button className="button">Validate</button></form>}
                      {r.review_status === 'pending' && v.status === 'passed' && <form action={review}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="decision" value="approved" /><button className="button">Technical approve</button></form>}
                      {r.review_status === 'pending' && <form action={review}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="decision" value="rejected" /><button className="button">Reject</button></form>}
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8, marginTop: 13 }}>
                    <div><small className="muted">Artifact</small><div>{r.artifact_name || '—'}</div></div>
                    <div><small className="muted">SHA-256</small><div style={{ wordBreak: 'break-all' }}>{r.checksum || '—'}</div></div>
                    <div><small className="muted">CI run</small><div>{r.artifact_run_id || '—'}</div></div>
                  </div>
                  <details style={{ marginTop: 11 }}><summary>Release record</summary><div style={{ display: 'grid', gap: 5, marginTop: 9 }}><small>Release ID: {r.id}</small><small>Source commit: {r.source_sha || '—'}</small><small style={{ whiteSpace: 'pre-wrap' }}>Changelog: {r.notes || '—'}</small></div></details>
                  {v.checks.length > 0 && <details style={{ marginTop: 7 }}><summary>Validation checks</summary><div style={{ display: 'grid', gap: 4, marginTop: 8 }}>{v.checks.map((c: any, i: number) => <small key={c.key || i}>{c.ok ? 'PASS' : 'FAIL'} · {c.message}</small>)}</div></details>}
                </article>;
              })}
            </div>}
        </section>

        <aside style={{ display: 'grid', gap: 11 }}>
          <section className="card" style={{ padding: 16 }}><h3 style={{ marginTop: 0 }}>Authority</h3><p className="muted">License Manager</p><ul className="muted" style={{ paddingLeft: 18, lineHeight: 1.7 }}><li>Intake</li><li>Validation</li><li>Technical approval</li><li>Audit history</li></ul></section>
          <section className="card" style={{ padding: 16 }}><h3 style={{ marginTop: 0 }}>Handoff</h3><p className="muted" style={{ marginBottom: 0 }}>Approved updates move to Billing Store for final customer-facing review and publication.</p></section>
        </aside>
      </div>
    </main>
  </div>;
}
