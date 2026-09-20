import {NextResponse} from 'next/server';
import {requireUser} from '../../../../lib/session';

const REPOS = {
  licenseManager: { repo: 'lucaskerim123/Custom-licence-manager', ci: 'ci.yml', deploy: 'production-deploy.yml', label: 'Custom License Manager' },
  billingStore: { repo: 'lucaskerim123/V2_Billing_Store', ci: 'ci.yml', deploy: 'production-deploy.yml', label: 'V2 Billing Store' },
} as const;
const roles = ['owner','admin','operator'];

async function authorize() {
  const user = await requireUser();
  if (!roles.includes(user.role)) throw new Error('You are not authorized to operate production jobs.');
}
async function github(path: string, init: RequestInit = {}) {
  const token = String(process.env.GITHUB_ACTIONS_TOKEN || '').trim();
  if (!token) throw new Error('GITHUB_ACTIONS_TOKEN is not configured on License Manager.');
  const response = await fetch('https://api.github.com' + path, {
    ...init,
    headers: { accept: 'application/vnd.github+json', authorization: 'Bearer ' + token, 'x-github-api-version': '2022-11-28', ...(init.headers || {}) },
    cache: 'no-store',
  });
  const body = await response.text();
  let data: any = null; try { data = body ? JSON.parse(body) : null; } catch {}
  if (!response.ok) throw new Error(data?.message || ('GitHub API returned HTTP ' + response.status + '.'));
  return data;
}
function cleanRun(run: any) {
  return run ? { id: run.id, status: run.status, conclusion: run.conclusion, run_number: run.run_number, head_sha: run.head_sha, created_at: run.created_at, updated_at: run.updated_at, html_url: run.html_url, name: run.name } : null;
}
export async function GET() {
  try {
    await authorize();
    const entries = await Promise.all(Object.entries(REPOS).map(async ([key, cfg]) => {
      const runs = await github('/repos/' + cfg.repo + '/actions/workflows/' + cfg.ci + '/runs?branch=main&per_page=1');
      const deploys = await github('/repos/' + cfg.repo + '/actions/workflows/' + cfg.deploy + '/runs?branch=main&per_page=1');
      return [key, { ...cfg, ci: cleanRun(runs.workflow_runs?.[0]), deploy: cleanRun(deploys.workflow_runs?.[0]) }] as const;
    }));
    return NextResponse.json({ jobs: Object.fromEntries(entries) });
  } catch (error: any) {
    const message = error?.message || 'Unable to load GitHub job status.';
    return NextResponse.json({ error: message }, { status: message.includes('authorized') ? 403 : 500 });
  }
}
export async function POST(request: Request) {
  try {
    await authorize();
    const body = await request.json();
    const job = String(body?.job || '') as keyof typeof REPOS;
    const action = String(body?.action || '');
    const cfg = REPOS[job];
    if (!cfg || !['ci','deploy'].includes(action)) return NextResponse.json({ error: 'Unknown job or action.' }, { status: 400 });
    const workflow = action === 'ci' ? cfg.ci : cfg.deploy;
    const inputs = action === 'deploy' ? { confirm_deploy: 'DEPLOY' } : {};
    await github('/repos/' + cfg.repo + '/actions/workflows/' + workflow + '/dispatches', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ref: 'main', inputs }),
    });
    return NextResponse.json({ ok: true, message: cfg.label + ' ' + (action === 'ci' ? 'CI' : 'production deployment') + ' queued.' });
  } catch (error: any) {
    const message = error?.message || 'Unable to start GitHub job.';
    return NextResponse.json({ error: message }, { status: message.includes('authorized') ? 403 : 500 });
  }
}
