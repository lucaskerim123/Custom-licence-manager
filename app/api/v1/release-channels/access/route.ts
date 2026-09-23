import { NextResponse } from 'next/server';
import { integrationAuthorized } from '../../../../../lib/auth';
import { db } from '../../../../../lib/db';

export async function POST(request: Request) {
  const auth = await integrationAuthorized(request, 'releases.write');
  if (!auth) return NextResponse.json({ error: 'UNAUTHORIZED', code: 'UNAUTHORIZED' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const action = String(body.action || (body.revoke ? 'revoke' : 'grant')).trim().toLowerCase();
  const licenseId = String(body.license_id || body.licenseId || '').trim();
  const channel = String(body.channel || '').trim().toLowerCase();
  const externalReference = body.external_reference ?? body.externalReference ?? null;

  if (!licenseId || !channel) return NextResponse.json({ error: 'LICENSE_AND_CHANNEL_REQUIRED' }, { status: 400 });

  const channelRow = (
    await db().query(
      'select id,access_mode,enabled,customer_visible,access_request_enabled,self_join_enabled from release_channels where channel=$1 limit 1',
      [channel],
    )
  ).rows[0];

  if (!channelRow) return NextResponse.json({ error: 'CHANNEL_NOT_FOUND' }, { status: 404 });
  if (!channelRow.enabled || !channelRow.customer_visible) return NextResponse.json({ error: 'CHANNEL_UNAVAILABLE' }, { status: 409 });

  if (action === 'request') {
    if (!channelRow.access_request_enabled) return NextResponse.json({ error: 'ACCESS_REQUESTS_DISABLED' }, { status: 409 });
    if (channelRow.access_mode === 'open' || channelRow.self_join_enabled) return NextResponse.json({ error: 'CHANNEL_DOES_NOT_REQUIRE_REQUEST' }, { status: 409 });
    const existing = (await db().query(
      'select * from release_channel_access_requests where license_id=$1 and channel=$2 and status=$3 limit 1',
      [licenseId, channel, 'pending'],
    )).rows[0];
    if (existing) return NextResponse.json({ request: existing, existing: true });
    const row = (await db().query(
      `insert into release_channel_access_requests(license_id,channel,external_reference,status)
       values($1,$2,$3,'pending') returning *`,
      [licenseId, channel, externalReference],
    )).rows[0];
    return NextResponse.json({ request: row }, { status: 201 });
  }

  if (action === 'grant' || action === 'join') {
    if (action === 'join' && channelRow.access_mode !== 'open' && !channelRow.self_join_enabled) {
      return NextResponse.json({ error: 'SELF_JOIN_DISABLED' }, { status: 403 });
    }
    const row = (await db().query(
      `insert into release_channel_access(license_id,channel,granted_by,external_reference)
       values($1,$2,$3,$4)
       on conflict(license_id,channel) do update
       set granted_by=excluded.granted_by,external_reference=excluded.external_reference,updated_at=now()
       returning *`,
      [licenseId, channel, auth.name, externalReference],
    )).rows[0];
    if (action === 'grant') {
      await db().query(
        `update release_channel_access_requests
         set status='approved',reviewed_at=now(),reviewed_by=$3
         where license_id=$1 and channel=$2 and status='pending'`,
        [licenseId, channel, auth.name],
      );
    }
    return NextResponse.json({ access: row });
  }

  if (action === 'revoke') {
    const row = (await db().query(
      'delete from release_channel_access where license_id=$1 and channel=$2 returning *',
      [licenseId, channel],
    )).rows[0];
    return NextResponse.json({ access: row ?? null, revoked: Boolean(row) });
  }

  if (action === 'reject') {
    const row = (await db().query(
      `update release_channel_access_requests
       set status='rejected',reviewed_at=now(),reviewed_by=$3,reason=$4
       where license_id=$1 and channel=$2 and status='pending' returning *`,
      [licenseId, channel, auth.name, body.reason ? String(body.reason) : null],
    )).rows[0];
    return NextResponse.json({ request: row ?? null });
  }

  return NextResponse.json({ error: 'UNSUPPORTED_ACCESS_ACTION' }, { status: 400 });
}
