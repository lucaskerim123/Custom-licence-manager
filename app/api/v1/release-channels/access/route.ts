import { NextResponse } from 'next/server';
import { integrationAuthorized } from '../../../../../lib/auth';
import { db } from '../../../../../lib/db';

export async function POST(request: Request) {
  const auth = await integrationAuthorized(request, 'releases.write');
  if (!auth) return NextResponse.json({ error: 'UNAUTHORIZED', code: 'UNAUTHORIZED' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const licenseId = String(body.license_id || body.licenseId || '').trim();
  const channel = String(body.channel || '').trim().toLowerCase();

  if (!licenseId || !channel) {
    return NextResponse.json({ error: 'LICENSE_AND_CHANNEL_REQUIRED' }, { status: 400 });
  }

  const channelRow = (
    await db().query(
      'select id,access_mode,enabled from release_channels where channel=$1 limit 1',
      [channel],
    )
  ).rows[0];

  if (!channelRow) {
    return NextResponse.json({ error: 'CHANNEL_NOT_FOUND' }, { status: 404 });
  }

  const row = (
    await db().query(
      `insert into release_channel_access(license_id,channel,granted_by,external_reference)
       values($1,$2,$3,$4)
       on conflict(license_id,channel) do update
       set granted_by=excluded.granted_by,external_reference=excluded.external_reference,updated_at=now()
       returning *`,
      [licenseId, channel, auth.name, body.external_reference ?? body.externalReference ?? null],
    )
  ).rows[0];

  return NextResponse.json({ access: row });
}
