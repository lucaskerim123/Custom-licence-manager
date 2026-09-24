import { NextResponse } from 'next/server';
import { integrationAuthorized } from '../../../../../lib/auth';
import { db } from '../../../../../lib/db';

async function ensureChannelAccessSchema(){
  const database=db();
  await database.query(`
    alter table if exists public.release_channels
      add column if not exists access_mode text not null default 'closed';
    alter table if exists public.release_channels
      add column if not exists access_request_enabled boolean not null default false;
    alter table if exists public.release_channels
      add column if not exists self_join_enabled boolean not null default false;

    create table if not exists public.release_channel_access (
      id uuid primary key default gen_random_uuid(),
      license_id uuid not null references public.licenses(id) on delete cascade,
      channel text not null references public.release_channels(channel) on delete cascade,
      granted_by text,
      external_reference text,
      expires_at timestamptz,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique(license_id,channel)
    );

    create table if not exists public.release_channel_access_requests (
      id uuid primary key default gen_random_uuid(),
      license_id uuid not null references public.licenses(id) on delete cascade,
      channel text not null references public.release_channels(channel) on delete cascade,
      external_reference text,
      status text not null default 'pending'
        check(status in ('pending','approved','rejected','cancelled')),
      requested_at timestamptz not null default now(),
      reviewed_at timestamptz,
      reviewed_by text,
      reason text
    );

    create unique index if not exists release_channel_access_requests_open_unique
      on public.release_channel_access_requests(license_id,channel)
      where status='pending';
    create index if not exists release_channel_access_requests_channel_status_idx
      on public.release_channel_access_requests(channel,status,requested_at desc);
    create index if not exists release_channel_access_requests_license_idx
      on public.release_channel_access_requests(license_id,status,requested_at desc);
    create index if not exists release_channel_access_license_idx
      on public.release_channel_access(license_id,channel);
    create index if not exists release_channel_access_expiry_idx
      on public.release_channel_access(channel,expires_at);
  `);
}

export async function GET(request: Request) {
  const auth = await integrationAuthorized(request, 'releases.read');
  if (!auth) return NextResponse.json({ error: 'UNAUTHORIZED', code: 'UNAUTHORIZED' }, { status: 401 });
  try {
    await ensureChannelAccessSchema();
  } catch (error:any) {
    console.error('release channel access schema check failed', error);
    return NextResponse.json(
      { error:'RELEASE_CHANNEL_SCHEMA_UNAVAILABLE', code:'RELEASE_CHANNEL_SCHEMA_UNAVAILABLE' },
      { status:503 },
    );
  }
  const url = new URL(request.url);
  const channel = String(url.searchParams.get('channel') || '').trim().toLowerCase();
  const view = String(url.searchParams.get('view') || 'requests').trim().toLowerCase();
  const status = String(url.searchParams.get('status') || 'pending').trim().toLowerCase();
  const params:any[]=[]; const where:string[]=[];
  if(channel){params.push(channel);where.push(`channel=$${params.length}`);}
  if(view==='access'){
    const accessParams:any[]=[]; const accessWhere:string[]=[];
    if(channel){accessParams.push(channel);accessWhere.push(`channel=$${accessParams.length}`);}
    const access=(await db().query(`select * from release_channel_access ${accessWhere.length?`where ${accessWhere.join(' and ')}`:''} order by channel,updated_at desc`,accessParams)).rows;
    return NextResponse.json({access});
  }
  if(status!=='all'){params.push(status);where.push(`status=$${params.length}`);}
  const rows=(await db().query(`select * from release_channel_access_requests ${where.length?`where ${where.join(' and ')}`:''} order by requested_at desc`,params)).rows;
  return NextResponse.json({requests:rows});
}

export async function POST(request: Request) {
  const auth = await integrationAuthorized(request, 'releases.write');
  if (!auth) return NextResponse.json({ error: 'UNAUTHORIZED', code: 'UNAUTHORIZED' }, { status: 401 });

  try {
    await ensureChannelAccessSchema();
  } catch (error:any) {
    console.error('release channel access schema check failed', error);
    return NextResponse.json(
      { error:'RELEASE_CHANNEL_SCHEMA_UNAVAILABLE', code:'RELEASE_CHANNEL_SCHEMA_UNAVAILABLE' },
      { status:503 },
    );
  }

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

  if (action === 'list_access') {
    const rows = (await db().query(
      `select * from release_channel_access where license_id=$1 order by channel`,
      [licenseId],
    )).rows;
    return NextResponse.json({ access: rows });
  }

  if (action === 'list_requests') {
    const rows = (await db().query(
      `select * from release_channel_access_requests where license_id=$1 order by requested_at desc`,
      [licenseId],
    )).rows;
    return NextResponse.json({ requests: rows });
  }

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
