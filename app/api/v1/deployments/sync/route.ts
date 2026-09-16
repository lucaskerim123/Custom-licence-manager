import { NextResponse } from 'next/server';
import { integrationAuthorized } from '../../../../../lib/auth';

const VERCEL_API = 'https://api.vercel.com';

export async function POST(request: Request) {
  const actor = await integrationAuthorized(request, 'deployment.read');
  if (!actor) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  try {
    const input = await request.json();
    const token = String(input.vercelAccessToken || '').trim();
    const deploymentId = String(input.vercelDeploymentId || '').trim();
    const teamId = input.vercelTeamId ? String(input.vercelTeamId) : null;
    if (!token || !deploymentId) return NextResponse.json({ error: 'VERCEL_DEPLOYMENT_REQUIRED' }, { status: 400 });

    const url = new URL(`/v13/deployments/${encodeURIComponent(deploymentId)}`, VERCEL_API);
    if (teamId) url.searchParams.set('teamId', teamId);
    const response = await fetch(url, { headers: { authorization: `Bearer ${token}` }, cache: 'no-store' });
    const text = await response.text();
    let data: any = {};
    try { data = text ? JSON.parse(text) : {}; } catch { data = { error: text }; }
    if (!response.ok) return NextResponse.json({ error: data?.error?.message || data?.error || `Vercel API ${response.status}` }, { status: response.status });

    return NextResponse.json({
      id: data.id || data.uid || deploymentId,
      state: data.readyState || data.state || 'BUILDING',
      url: data.url ? `https://${data.url}` : null,
      error: data.error?.message || data.error || null,
      projectId: data.projectId || null,
    });
  } catch (error: any) {
    return NextResponse.json({ error: String(error?.message || 'Deployment sync failed') }, { status: 502 });
  }
}
