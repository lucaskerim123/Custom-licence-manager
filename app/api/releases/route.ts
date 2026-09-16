import { NextRequest, NextResponse } from 'next/server';
import { db } from '../../../lib/db';
import { serviceAuthorized } from '../../../lib/auth';

export async function GET(){const r=await db().query(`select r.id,r.version,r.channel,r.release_type,r.status,r.source_repo,r.source_ref,r.artifact_url,r.notes,p.slug product from releases r join products p on p.id=r.product_id order by r.created_at desc`);return NextResponse.json(r.rows)}
export async function POST(request:NextRequest){if(!serviceAuthorized(request,process.env.DEPLOYER_API_TOKEN))return NextResponse.json({error:'Unauthorized'},{status:401});const b=await request.json();const r=await db().query(`insert into releases(product_id,channel,version,release_type,source_repo,source_ref,artifact_url,status,notes) values($1,$2,$3,$4,$5,$6,$7,$8,$9) returning *`,[b.product_id,b.channel??'stable',b.version,b.release_type,b.source_repo,b.source_ref,b.artifact_url,b.status??'draft',b.notes]);return NextResponse.json(r.rows[0],{status:201})}
