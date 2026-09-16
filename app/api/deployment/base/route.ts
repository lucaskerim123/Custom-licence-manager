import { NextRequest, NextResponse } from 'next/server';
import { db } from '../../../../../lib/db';
import { integrationAuthorized } from '../../../../../lib/auth';

export async function GET(request:NextRequest){if(!integrationAuthorized(request))return NextResponse.json({error:'Unauthorized'},{status:401});const product=String(new URL(request.url).searchParams.get('product')||'');if(!product)return NextResponse.json({error:'product is required'},{status:400});const r=await db().query(`select r.id,r.version,r.channel,r.artifact_url,r.checksum,r.source_repo,r.source_ref,r.notes,p.slug product from releases r join products p on p.id=r.product_id where p.slug=$1 and r.release_type='base' and r.status='published' order by r.created_at desc limit 1`,[product]);if(!r.rowCount)return NextResponse.json({error:'No published base release'},{status:404});return NextResponse.json(r.rows[0]);}
