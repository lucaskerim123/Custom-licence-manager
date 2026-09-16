import { NextResponse } from 'next/server';
import { db } from '../../../../../lib/db';
import { createRelease } from '../../../../../lib/core/releases';

export const runtime='nodejs';

function authorized(request:Request){
  const expected=process.env.LICENSE_MANAGER_INGEST_TOKEN?.trim();
  const supplied=request.headers.get('authorization')?.replace(/^Bearer\s+/i,'').trim();
  return Boolean(expected&&supplied&&supplied===expected);
}

export async function POST(request:Request){
  if(!authorized(request)) return NextResponse.json({error:'UNAUTHORIZED'},{status:401});
  const body=await request.json().catch(()=>null);
  if(!body||body.event_type!=='orbitfs-base-release'||!body.product_id||!body.version||!body.source_repo||!body.source_sha||!body.artifact_run_id||!body.artifact_name){
    return NextResponse.json({error:'INVALID_RELEASE_INTAKE',required:['event_type','product_id','version','source_repo','source_sha','artifact_run_id','artifact_name']},{status:400});
  }
  try{
    const pool=db();
    const product=(await pool.query(`insert into products(slug,name,status) values($1,$2,'active') on conflict(slug) do update set name=excluded.name,updated_at=now() returning id`,[String(body.product_id),String(body.product??'OrbitFS Base')])).rows[0];
    const existing=(await pool.query(`select id from releases where product_id=$1 and channel=$2 and version=$3 and release_type='base'`,[product.id,String(body.channel??'stable').toLowerCase(),String(body.version)])).rows[0];
    if(existing) return NextResponse.json({ok:true,duplicate:true,release_id:existing.id});
    const row=await createRelease({
      productId:product.id,channel:String(body.channel??'stable').toLowerCase(),version:String(body.version),releaseType:'base',
      sourceRepo:String(body.source_repo),sourceRef:String(body.source_branch??'base-release'),sourceSha:String(body.source_sha),
      artifactName:String(body.artifact_name),artifactRepo:String(body.artifact_repo??'lucaskerim123/V1-vercel-base'),artifactRunId:Number(body.artifact_run_id),
      vercelReady:Boolean(body.vercel_ready),supabaseReady:Boolean(body.supabase_ready),customerPublicationRepo:String(body.customer_publication_repo??'lucaskerim123/V2_Billing_Store'),
      artifactUrl:null,reviewStatus:'pending',deploymentStatus:'not_started',notes:'Automatically received from the OrbitFS Base release pipeline.',actor:'orbitfs-base-release'
    });
    return NextResponse.json({ok:true,release_id:row.id,status:row.status,review_status:row.review_status});
  }catch(error){
    return NextResponse.json({error:error instanceof Error?error.message:'Unable to ingest release'},{status:503});
  }
}
