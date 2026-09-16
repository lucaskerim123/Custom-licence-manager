import { NextRequest, NextResponse } from 'next/server';
import { db } from '../../../../lib/db';
import { adminAuthorized } from '../../../../lib/auth';

export async function GET(request: NextRequest) {
  if (!adminAuthorized(request)) return NextResponse.json({ error:'Unauthorized' }, { status:401 });
  const result = await db().query('select * from system_settings where id=true');
  return NextResponse.json(result.rows[0]);
}

export async function PATCH(request: NextRequest) {
  if (!adminAuthorized(request)) return NextResponse.json({ error:'Unauthorized' }, { status:401 });
  const body = await request.json();
  const result = await db().query(`update system_settings set system_enabled=coalesce($1,system_enabled), licensing_enabled=coalesce($2,licensing_enabled), maintenance_mode=coalesce($3,maintenance_mode), updated_at=now() where id=true returning *`, [body.system_enabled ?? null, body.licensing_enabled ?? null, body.maintenance_mode ?? null]);
  await db().query(`insert into audit_events(actor,action,resource_type,details) values($1,'settings.update','system_settings',$2)`, ['admin', JSON.stringify(body)]);
  return NextResponse.json(result.rows[0]);
}
