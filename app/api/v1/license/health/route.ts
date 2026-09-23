import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { db } from '../../../../../lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  const started = Date.now();

  try {
    const database = await db().query('select 1 as ok');
    const settings = (await db().query(
      'select system_enabled, licensing_enabled, release_system_enabled, deployment_enabled, maintenance_mode from system_settings where id=true',
    )).rows[0];

    return NextResponse.json({
      ok: true,
      service: 'license-master',
      api_version: 'v1',
      authority: 'orbitfs-license-master',
      database: database.rows[0]?.ok === 1,
      latency_ms: Date.now() - started,
      capabilities: {
        license_validation: Boolean(settings?.system_enabled && settings?.licensing_enabled && !settings?.maintenance_mode),
        license_issuance: Boolean(settings?.system_enabled && settings?.licensing_enabled && !settings?.maintenance_mode),
        releases: Boolean(settings?.system_enabled && settings?.release_system_enabled),
        deployment: Boolean(settings?.system_enabled && settings?.deployment_enabled),
      },
    });
  } catch (error) {
    const requestId = crypto.randomUUID();
    console.error('license master health failed', { requestId, error });

    return NextResponse.json(
      {
        ok: false,
        service: 'license-master',
        api_version: 'v1',
        authority: 'orbitfs-license-master',
        code: 'HEALTH_CHECK_FAILED',
        request_id: requestId,
      },
      { status: 503 },
    );
  }
}
