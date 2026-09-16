import { NextResponse } from 'next/server';
import { integrationAuthorized } from '../../../../lib/auth';
import { db } from '../../../../lib/db';

export async function GET(request: Request) {
  const actor = await integrationAuthorized(request, 'deployment.read');
  if (!actor) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  const result = await db().query(`
    select a.id as activation_id,a.installation_id,a.product_version,a.last_seen_at,
           l.id as license_id,l.status as license_status,l.customer_external_id,
           p.slug as product
      from activations a
      join licenses l on l.id=a.license_id
      join products p on p.id=l.product_id
     order by a.last_seen_at desc
     limit 500
  `);
  return NextResponse.json({ installations: result.rows });
}
