import { NextResponse } from 'next/server';
import { db } from '../../../../../lib/db';
import { integrationAuthorized } from '../../../../../lib/auth';
import { createRelease } from '../../../../../lib/core/releases';

export const runtime='nodejs';

export async function POST(request:Request){
  const auth=await integrationAuthorized(request,'releases.write');
  if(!auth) return NextResponse.json({error:'UNAUTHORIZED'},{status:401});
  const body=await request.json().catch(()=>null);
  if(!body||body.event_type!=='orbitfs-base-release'||!body.product_id||!body.version||!body.source_repo||!body.source_sha||!body.artifact_run_id||!body.artifact_name||!body.artifact_url){
    return NextResponse.json({error:'INVALID_RELEASE_INTAKE',required:['event_type','product_id','version','source_repo','source_sha','artifact_run_id','artifact_name','artifact_url']},{status:400});
  }
  try{
    const pool=db();
    const product=(await pool.query(`insert into products(slug,name,status) values($1,$2,'active') on conflict(slug) do update set name=excluded.name,updated_at=now() returning id`,[String(body.product_id),String(body.product??'OrbitFS Base')])).rows[0];
    const channel=String(body.channel??'stable').toLowerCase();
    const version=String(body.version);
    const changelog=typeof body.changelog==='string'&&body.changelog.trim()?body.changelog.trim():null;
    const manifest={
      event_type:String(body.event_type),product_id:String(body.product_id),product:String(body.product??'OrbitFS Base'),
      release_type:'base',source_repo:String(body.source_repo),source_branch:String(body.source_branch??'base-release'),source_sha:String(body.source_sha),
      artifact_repo:String(body.artifact_repo??'lucaskerim123/V1-vercel-base'),artifact_run_id:Number(body.artifact_run_id),artifact_name:String(body.artifact_name),
      artifact_url:String(body.artifact_url),checksum:String(body.checksum??''),vercel_ready:Boolean(body.vercel_ready),supabase_ready:Boolean(body.supabase_ready),
      ingested_at:new Date().toISOString()
    };
    const existing=(await pool.query(`select id,status,review_status,deployment_status from releases where product_id=$1 and channel=$2 and version=$3 and release_type='base'`,[product.id,channel,version])).rows[0];
    const settings=(await pool.query('select system_enabled,release_system_enabled from system_settings where id=true')).rows[0];
    if(!settings?.system_enabled||!settings.release_system_enabled) return NextResponse.json({error:'RELEASE_SYSTEM_OFFLINE'},{status:503});

    if(existing){
      const updated=(await pool.query(`update releases set source_repo=$1,source_ref=$2,source_sha=$3,artifact_name=$4,artifact_repo=$5,artifact_run_id=$6,artifact_url=$7,checksum=$8,vercel_ready=$9,supabase_ready=$10,notes=$11,manifest=$12,updated_at=now() where id=$13 returning id,status,review_status,deployment_status,artifact_url`,[
        String(body.source_repo),String(body.source_branch??'base-release'),String(body.source_sha),String(body.artifact_name),String(body.artifact_repo??'lucaskerim123/V1-vercel-base'),Number(body.artifact_run_id),String(body.artifact_url),String(body.checksum??'')||null,Boolean(body.vercel_ready),Boolean(body.supabase_ready),changelog??'Automatically received from the OrbitFS Base release pipeline.',JSON.stringify(manifest),existing.id
      ])).rows[0];
      const validated=await import('../../../../../lib/core/releases').then(m=>m.validateRelease(updated.id,null,'orbitfs-base-release-validator'));return NextResponse.json({ok:true,updated:true,duplicate:true,release_id:validated.id,status:validated.status,review_status:validated.review_status,validation:validated.manifest?.validation??null,deployment_status:validated.deployment_status,artifact_url:validated.artifact_url});
    }

    const row=await createRelease({
      productId:product.id,channel,version,releaseType:'base',
      sourceRepo:String(body.source_repo),sourceRef:String(body.source_branch??'base-release'),sourceSha:String(body.source_sha),
      artifactName:String(body.artifact_name),artifactRepo:String(body.artifact_repo??'lucaskerim123/V1-vercel-base'),artifactRunId:Number(body.artifact_run_id),
      artifactUrl:String(body.artifact_url),checksum:String(body.checksum??'')||null,
      vercelReady:Boolean(body.vercel_ready),supabaseReady:Boolean(body.supabase_ready),customerPublicationRepo:String(body.customer_publication_repo??'lucaskerim123/V2_Billing_Store'),
      reviewStatus:'pending',deploymentStatus:'not_started',notes:changelog??'Automatically received from the OrbitFS Base release pipeline.',actor:'orbitfs-base-release',manifest
    });
    return NextResponse.json({ok:true,release_id:row.id,status:row.status,review_status:row.review_status,validation:row.manifest?.validation??null,artifact_url:row.artifact_url});
  }catch(error){
    return NextResponse.json({error:error instanceof Error?error.message:'Unable to ingest release'},{status:503});
  }
}
