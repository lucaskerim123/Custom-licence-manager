import { NextResponse } from 'next/server';
import { integrationAuthorized } from '../../../lib/auth';
import { listProducts } from '../../../lib/core/products';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = (await integrationAuthorized(request, 'license.manage')) || (await integrationAuthorized(request, 'license.issue')) || (await integrationAuthorized(request, 'releases.read'));
  if (!auth) return NextResponse.json({ error: 'UNAUTHORIZED', code: 'UNAUTHORIZED' }, { status: 401 });
  try {
    const products = await listProducts();
    return NextResponse.json({ products });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'PRODUCT_LIST_FAILED', code: 'PRODUCT_LIST_FAILED' }, { status: 500 });
  }
}
