import { NextResponse } from 'next/server';
import { integrationAuthorized } from '../../../../../lib/auth';
import { db } from '../../../../../lib/db';
import { publishRelease, updateReleasePresentation, setReleaseReview, archiveRelease, deleteRelease, rollbackBaseRelease, withdrawRelease } from '../../../../../lib/core/releases';

export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){
  if(!(await integrationAuthorized(request,'releases.read')))return NextResponse.json({error:'UNAUTHORIZED'},{status:401});
  const {id}=await params;const row=(await db().query(`select r.*,p.slug product,p.name product_name from releases r join products p on p.id=r.product_id where r.id=$1 limit 1`,[id])).rows[0];
  return row?NextResponse.json({release:row}):NextResponse.json({error:'RELEASE_NOT_FOUND'},{status:404});
}

export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}){
  if(!(await integrationAuthorized(request,'releases.write')))return NextResponse.json({error:'UNAUTHORIZED'},{status:401});
  const {id}=await params;const body=await request.json().catch(()=>null);
  const presentation=['title','description','changelog','customer_notes','internal_notes','severity','required','rollout','minimum_version','rollback_version'];
  const presentationPatch:any={}; for(const field of presentation){if(Object.prototype.hasOwnProperty.call(body??{},field))presentationPatch[field]=body[field];}
  const hasPresentation=Object.keys(presentationPatch).length>0;
  const allowed=['channel','version','source_repo','source_ref','artifact_url','checksum','notes','artifact_name','artifact_repo','artifact_run_id','source_sha','vercel_ready','supabase_ready','deployment_status','customer_publication_repo'];
  const updates:string[]=[];const values:any[]=[];let i=1;
  for(const field of allowed){if(Object.prototype.hasOwnProperty.call(body??{},field)){updates.push(`${field}=${i++}`);values.push(body[field]===null?null:body[field]);}}
  let row:any=null;
  if(updates.length){values.push(id);row=(await db().query(`update releases set ${updates.join(',')} where id=${i} returning *`,values)).rows[0];}
  if(hasPresentation){row=await updateReleasePresentation(id,presentationPatch,null,'billing-store');}
  if(!updates.length&&!hasPresentation)return NextResponse.json({error:'NO_CHANGES'},{status:400});
  return row?NextResponse.json({release:row}):NextResponse.json({error:'RELEASE_NOT_FOUND'},{status:404});
}

export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
  if(!(await integrationAuthorized(request,'releases.write')))return NextResponse.json({error:'UNAUTHORIZED'},{status:401});
  const {id}=await params;const body=await request.json().catch(()=>null);const action=String(body?.action||'').toLowerCase();
  try{
    if(action==='publish'){
      const current=(await db().query('select id,review_status from releases where id=$1',[id])).rows[0];
      if(!current)return NextResponse.json({error:'RELEASE_NOT_FOUND'},{status:404});
      if(current.review_status!=='approved')return NextResponse.json({error:'RELEASE_NOT_APPROVED'},{status:409});
      const row=await publishRelease(id,null,'billing-store');
      return row?NextResponse.json({release:row}):NextResponse.json({error:'RELEASE_NOT_FOUND'},{status:404});
    }
    if(action==='approve'){
      const row=await setReleaseReview(id,'approved',null,'integration-api');
      return row?NextResponse.json({release:row}):NextResponse.json({error:'RELEASE_NOT_FOUND'},{status:404});
    }
    if(action==='archive'||action==='restore'){const row=await archiveRelease(id,action==='archive',null,'integration-api');return row?NextResponse.json({release:row}):NextResponse.json({error:'RELEASE_NOT_FOUND'},{status:404});}
    if(action==='delete'){const row=await deleteRelease(id,null,'integration-api');return row?NextResponse.json({ok:true,deleted:true,release:row}):NextResponse.json({error:'RELEASE_NOT_FOUND'},{status:404});}
    if(action==='withdraw'){
      const row=await withdrawRelease(id,null,'integration-api');
      return row?NextResponse.json({release:row}):NextResponse.json({error:'RELEASE_NOT_FOUND'},{status:404});
    }
    if(action==='rollback'){
      const row=await rollbackBaseRelease(id,null,'integration-api');
      return row?NextResponse.json({release:row}):NextResponse.json({error:'RELEASE_NOT_FOUND'},{status:404});
    }
    if(action==='draft'||action==='disable'){
      const status=action==='draft'?'draft':'disabled';
      const row=(await db().query(`update releases set status=$2,published_at=case when $2='draft' then null else published_at end where id=$1 returning *`,[id,status])).rows[0];
      return row?NextResponse.json({release:row}):NextResponse.json({error:'RELEASE_NOT_FOUND'},{status:404});
    }
    return NextResponse.json({error:'UNSUPPORTED_RELEASE_ACTION'},{status:400});
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Unable to control release'},{status:503});}
}
