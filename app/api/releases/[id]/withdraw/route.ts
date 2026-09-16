import { NextResponse } from 'next/server';
import { integrationAuthorized } from '../../../../../lib/auth';
import { db } from '../../../../../lib/db';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await integrationAuthorized(request, 'releases.write');
  if (!auth) return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
  const { id } = await params;
  const result = await db().query(`update releases set status='disabled' where id=$1 returning *`, [id]);
  if (!result.rows[0]) return NextResponse.json({ error: 'RELEASE_NOT_FOUND' }, { status: 404 });
  return NextResponse.json({ release: result.rows[0] });
}
