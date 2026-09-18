import { NextResponse } from 'next/server';
import { db } from '../../../../../lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const result = await db().query('select max(updated_at) as updated_at from releases');
    return NextResponse.json({
      ok: true,
      service: 'license-manager',
      revision: process.env.VERCEL_GIT_COMMIT_SHA || process.env.GIT_COMMIT_SHA || 'unknown',
      updated_at: result.rows[0]?.updated_at ?? null,
    });
  } catch {
    return NextResponse.json({
      ok: true,
      service: 'license-manager',
      revision: process.env.VERCEL_GIT_COMMIT_SHA || process.env.GIT_COMMIT_SHA || 'unknown',
      updated_at: null,
    });
  }
}
