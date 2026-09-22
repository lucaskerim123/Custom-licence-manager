'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import styles from './operations-run.module.css';

const systems = [
  { key: 'licenseManager', label: 'Custom License Manager', repo: 'lucaskerim123/Custom-licence-manager' },
  { key: 'billingStore', label: 'V2 Billing Store', repo: 'lucaskerim123/V2_Billing_Store' },
] as const;

function time(value?: string | null) {
  return value ? new Date(value).toLocaleString() : '—';
}

function duration(start?: string | null, end?: string | null) {
  if (!start) return '—';
  const finish = end ? new Date(end).getTime() : Date.now();
  const seconds = Math.max(0, Math.floor((finish - new Date(start).getTime()) / 1000));
  return seconds < 60 ? seconds + 's' : Math.floor(seconds / 60) + 'm ' + (seconds % 60) + 's';
}

function status(run: any) {
  if (!run) return 'NO RUN';
  if (run.status !== 'completed') return 'LIVE';
  return run.conclusion === 'success' ? 'PASSED' : run.conclusion === 'cancelled' ? 'CANCELLED' : String(run.conclusion || 'FAILED').toUpperCase();
}

function kind(run: any) {
  if (!run) return 'neutral';
  if (run.status !== 'completed') return 'running';
  return run.conclusion === 'success' ? 'ok' : run.conclusion === 'cancelled' ? 'neutral' : 'bad';
}

export default function RunPage() {
  const [data, setData] = useState<Record<string, any>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({ billingStore: false });
  const [consoleOpen, setConsoleOpen] = useState<Record<string, boolean>>({
    licenseManager: true,
    billingStore: true,
  });
  const [lastRefresh, setLastRefresh] = useState('');

  const load = useCallback(async () => {
    try {
      const results = await Promise.all(
        systems.map(async (system) => {
          const response = await fetch('/api/operations/run?system=' + system.key, { cache: 'no-store' });
          const result = await response.json();
          if (!response.ok) throw new Error(system.label + ': ' + (result.error || 'Unable to load workflow.'));
          return [system.key, result] as const;
        }),
      );
      setData(Object.fromEntries(results));
      setError('');
      setLastRefresh(new Date().toISOString());
    } catch (e: any) {
      setError(e?.message || 'Unable to load workflow status.');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const live = useMemo(
    () => systems.some((system) => data[system.key]?.run?.status && data[system.key].run.status !== 'completed'),
    [data],
  );

  useEffect(() => {
    const timer = setInterval(load, live ? 3000 : 15000);
    return () => clearInterval(timer);
  }, [live, load]);

  async function action(system: string, actionType: 'ci' | 'deploy' | 'override-deploy') {
    if ((actionType === 'deploy' || actionType === 'override-deploy') &&
        !window.confirm((actionType === 'override-deploy' ? 'OVERRIDE DEPLOY ' : 'Deploy ') +
          systems.find((item) => item.key === system)?.label + '?')) {
      return;
    }

    setBusy(system + actionType);
    setError('');

    try {
      const response = await fetch('/api/operations', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ job: system, action: actionType }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Unable to start job.');
      await load();
      setConsoleOpen((previous) => ({ ...previous, [system]: true }));
    } catch (e: any) {
      setError(e?.message || 'Unable to start job.');
    } finally {
      setBusy('');
    }
  }

  async function copyPrompt(prompt: string) {
    if (prompt) await navigator.clipboard.writeText(prompt);
  }

  return (
    <div className={styles.content}>
      <header className={styles.top}>
        <div>
          <div className={styles.eyebrow}>LICENSE MANAGER / OPERATIONS</div>
          <h1>Operations</h1>
          <p className={styles.muted}>
            Production control for both systems. Scan and prepare the exact main commit, monitor it live, then deploy manually.
          </p>
        </div>
        <div className={styles.liveHeader}>
          <span className={styles.liveDot} />
          {live ? 'LIVE MONITORING' : 'STATUS MONITOR'}
          <small>{lastRefresh ? 'Updated ' + time(lastRefresh) : 'Connecting…'}</small>
        </div>
      </header>

      {error && <div className={styles.error}>{error}</div>}

      <section className={styles.controlBar}>
        <div>
          <strong>Manual deployment control</strong>
          <span>No automatic Vercel deployment is triggered. Scan &amp; Prepare validates the commit; Deploy runs only from this panel.</span>
        </div>
        <button onClick={load} disabled={!!busy}>{live ? 'Refresh now' : 'Refresh'}</button>
      </section>

      <div className={styles.systems}>
        {systems.map((system) => {
          const systemData = data[system.key];
          const run = systemData?.run;
          const workflow = systemData?.monitoring || 'Workflow';
          const passed = run?.status === 'completed' && run?.conclusion === 'success';
          const isCollapsed = !!collapsed[system.key];
          const isConsoleOpen = consoleOpen[system.key] !== false;

          return (
            <article className={styles.system} key={system.key}>
              <button
                className={styles.systemToggle}
                onClick={() => setCollapsed((previous) => ({ ...previous, [system.key]: !previous[system.key] }))}
                aria-expanded={!isCollapsed}
              >
                <span>
                  <strong>{system.label}</strong>
                  <code>{system.repo}</code>
                </span>
                <span className={styles.headStatus}>
                  <span className={styles.badge + ' ' + styles[kind(run)]}>{status(run)}</span>
                  <span className={styles.chevron}>{isCollapsed ? '▸' : '▾'}</span>
                </span>
              </button>

              {!isCollapsed && (
                <div className={styles.systemBody}>
                  <div className={styles.row}>
                    <div>
                      <strong>Scan &amp; Prepare</strong>
                      <span>{run ? '#' + run.run_number + ' · ' + time(run.updated_at) + ' · ' + run.head_sha.slice(0, 12) : 'No production gate run yet'}</span>
                    </div>
                    <button className={styles.primaryAction} onClick={() => action(system.key, 'ci')} disabled={!!busy}>
                      {busy === system.key + 'ci' ? 'Scanning…' : 'Scan & Prepare'}
                    </button>
                  </div>

                  <div className={styles.row}>
                    <div>
                      <strong>Production Deployment</strong>
                      <span>{passed ? 'Ready — exact commit passed Scan & Prepare.' : 'Blocked until the exact current commit passes Scan & Prepare.'}</span>
                    </div>
                    <div className={styles.actions}>
                      <button className={styles.deploy} onClick={() => action(system.key, 'deploy')} disabled={!!busy || !passed}>
                        {busy === system.key + 'deploy' ? 'Deploying…' : 'Deploy'}
                      </button>
                      <button onClick={() => action(system.key, 'override-deploy')} disabled={!!busy}>
                        {busy === system.key + 'override-deploy' ? 'Starting…' : 'Override'}
                      </button>
                    </div>
                  </div>

                  {systemData?.latestDeployment && (
                    <div className={styles.latestDeployment}>
                      <strong>Latest production deployment</strong>
                      <span>
                        #{systemData.latestDeployment.run_number} · {status(systemData.latestDeployment)} ·{' '}
                        {time(systemData.latestDeployment.updated_at)} · {systemData.latestDeployment.head_sha.slice(0, 12)}
                      </span>
                      <span className={styles.internalOnly}>Details are shown in the live console above.</span>
                    </div>
                  )}

                  {run && (
                    <section className={styles.consoleCard}>
                      <button
                        className={styles.consoleHeader}
                        onClick={() => setConsoleOpen((previous) => ({ ...previous, [system.key]: !isConsoleOpen }))}
                        aria-expanded={isConsoleOpen}
                      >
                        <span>
                          <strong>LIVE CONSOLE</strong>
                          <small>
                            {run.status === 'completed'
                              ? 'Final output'
                              : 'Live workflow status · jobs and console output refresh every ' + (live ? '3' : '15') + ' seconds'}
                          </small>
                        </span>
                        <span className={styles.consoleIndicator}>
                          {run.status === 'completed' ? '● CLOSED' : '● LIVE'} {isConsoleOpen ? '▾' : '▸'}
                        </span>
                      </button>

                      {isConsoleOpen && (
                        <div className={styles.consoleBody}>
                          <div className={styles.meta}>
                            {[
                              ['Workflow', workflow],
                              ['Run', '#' + run.run_number],
                              ['Commit', run.head_sha],
                              ['Updated', time(run.updated_at)],
                              ['State', status(run)],
                            ].map(([label, value]) => (
                              <div key={label}>
                                <span>{label}</span>
                                <strong>{value}</strong>
                              </div>
                            ))}
                          </div>

                          <div className={styles.jobs}>
                            {(systemData?.jobs || []).map((job: any) => (
                              <article className={styles.job} key={job.id}>
                                <div className={styles.jobHead}>
                                  <div>
                                    <strong>{job.name}</strong>
                                    <span>
                                      {job.status} · {job.conclusion || 'in progress'} · {duration(job.started_at, job.completed_at)}
                                    </span>
                                  </div>
                                  <span className={styles.stepBadge}>
                                    {job.conclusion === 'success'
                                      ? 'PASSED'
                                      : job.conclusion === 'failure'
                                        ? 'FAILED'
                                        : String(job.status).toUpperCase()}
                                  </span>
                                </div>

                                <div className={styles.steps}>
                                  {(job.steps || []).map((step: any) => (
                                    <div className={styles.step} key={step.name}>
                                      <span>
                                        {step.conclusion === 'success'
                                          ? '✓'
                                          : step.conclusion === 'failure'
                                            ? '✕'
                                            : step.status === 'in_progress'
                                              ? '●'
                                              : '○'}
                                      </span>
                                      <div>
                                        <b>{step.name}</b>
                                        <small>{step.status}{step.conclusion ? ' · ' + step.conclusion : ''}</small>
                                      </div>
                                    </div>
                                  ))}
                                </div>

                                <details className={styles.logDetails} open={job.conclusion === 'failure'}>
                                  <summary>
                                    {job.conclusion === 'failure' ? 'Failed output' : 'Console output'} ·{' '}
                                    {job.status === 'completed' ? 'final' : 'live'}
                                  </summary>
                                  <pre className={styles.log}>
                                    {job.logTail ||
                                      'Waiting for GitHub to expose console output for this job…\nLive step status is available above. This panel refreshes automatically while the workflow is running.'}
                                  </pre>
                                </details>
                              </article>
                            ))}
                          </div>
                        </div>
                      )}
                    </section>
                  )}

                  {systemData?.failure && (
                    <details className={styles.errorPanel}>
                      <summary>
                        <div>
                          <h2>Failure report</h2>
                          <p className={styles.muted}>{systemData.failure.lines.length} captured error/context lines.</p>
                        </div>
                      </summary>
                      <div className={styles.errorBody}>
                        <pre className={styles.errorLog}>{systemData.failure.lines.join('\n')}</pre>
                        {systemData.chatPrompt && (
                          <div className={styles.prompt}>
                            <div className={styles.sectionHead}>
                              <div>
                                <h3>ChatGPT / Codex repair prompt</h3>
                                <p className={styles.muted}>Includes the run, failed job, commit and captured errors.</p>
                              </div>
                              <button className={styles.linkButton} onClick={() => copyPrompt(systemData.chatPrompt)}>Copy prompt</button>
                            </div>
                            <pre>{systemData.chatPrompt}</pre>
                          </div>
                        )}
                      </div>
                    </details>
                  )}
                </div>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}
