import {NextResponse} from 'next/server';
import {integrationAuthorized} from '../../../../../lib/auth';
import {db} from '../../../../../lib/db';
import {archiveRelease,deleteRelease,publishRelease,promoteRelease,rollbackBaseRelease,setReleaseReview,createPresentationRevision,updateReleasePresentation,withdrawRelease} from '../../../../../lib/core/releases';

export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){
  const auth=await integrationAuthorized(request,'releases.read');
  if(!auth)return NextResponse.json({error:'UNAUTHORIZED',code:'UNAUTHORIZED'},{status:401});
  const {id}=await params;
  const row=(await db().query("select r.*,p.slug product,p.name product_name from releases r join products p on p.id=r.product_id where r.id=$1 limit 1",[id])).rows[0];
  if(!row)return NextResponse.json({error:'RELEASE_NOT_FOUND'},{status:404});
  return NextResponse.json({release:row});
}
export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}){
  const auth=await integrationAuthorized(request,'releases.write');
  if(!auth)return NextResponse.json({error:'UNAUTHORIZED',code:'UNAUTHORIZED'},{status:401});
  const {id}=await params; const body=await request.json().catch(()=>({}));
  const current=(await db().query('select release_type from releases where id=$1 limit 1',[id])).rows[0];
  if(!current)return NextResponse.json({error:'RELEASE_NOT_FOUND'},{status:404});
  if(current.release_type!=='update')return NextResponse.json({error:'BASE_RELEASE_CONTROLLED_BY_LICENSE_MANAGER',code:'BASE_RELEASE_CONTROLLED_BY_LICENSE_MANAGER'},{status:403});
  try{const release=await updateReleasePresentation(id,body,undefined,`api:${auth.name}`);if(!release)return NextResponse.json({error:'RELEASE_NOT_FOUND'},{status:404});return NextResponse.json({release});}
  catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Unable to update release',code:'RELEASE_UPDATE_FAILED'},{status:400});}
}
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
  const auth=await integrationAuthorized(request,'releases.write');
  if(!auth)return NextResponse.json({error:'UNAUTHORIZED',code:'UNAUTHORIZED'},{status:401});
  const {id}=await params; const body=await request.json().catch(()=>({})); const action=String(body.action||'').trim().toLowerCase();
  const current=(await db().query('select release_type from releases where id=$1 limit 1',[id])).rows[0];
  if(!current)return NextResponse.json({error:'RELEASE_NOT_FOUND'},{status:404});
  if(action==='approve'||action==='reject'||action==='rollback'){
    return NextResponse.json({error:'TECHNICAL_RELEASE_CONTROL_REQUIRES_LICENSE_MANAGER_ADMIN',code:'TECHNICAL_RELEASE_CONTROL_REQUIRES_LICENSE_MANAGER_ADMIN'},{status:403});
  }
  if(current.release_type!=='update'){
    return NextResponse.json({error:'BASE_RELEASE_CONTROLLED_BY_LICENSE_MANAGER',code:'BASE_RELEASE_CONTROLLED_BY_LICENSE_MANAGER'},{status:403});
  }
  try{
    if(action==='publish')return NextResponse.json({release:await publishRelease(id,undefined,`api:${auth.name}`)});
    if(action==='withdraw')return NextResponse.json({release:await withdrawRelease(id,undefined,`api:${auth.name}`)});
    if(action==='disable'||action==='pause'){const row=(await db().query("select * from releases where id=$1 limit 1",[id])).rows[0];if(!row)return NextResponse.json({error:'RELEASE_NOT_FOUND'},{status:404});const release=(await db().query("update releases set status='disabled' where id=$1 returning *",[id])).rows[0];await db().query("insert into audit_events(actor,action,resource_type,resource_id,details) values($1,'release.pause','release',$2,$3)",["api:"+auth.name,id,JSON.stringify({previous_status:row.status})]);return NextResponse.json({release});}
    if(action==='archive')return NextResponse.json({release:await archiveRelease(id,true,undefined,`api:${auth.name}`)});
    if(action==='restore')return NextResponse.json({release:await archiveRelease(id,false,undefined,`api:${auth.name}`)});
    if(action==='delete')return NextResponse.json({release:await deleteRelease(id,undefined,`api:${auth.name}`)});
    if(action==='promote')return NextResponse.json({release:await promoteRelease(id,String(body.target_channel||body.targetChannel||'').trim().toLowerCase(),undefined,`api:${auth.name}`)});
    if(action==='revise')return NextResponse.json({release:await createPresentationRevision(id,body,undefined,`api:${auth.name}`)});
    return NextResponse.json({error:'UNSUPPORTED_RELEASE_ACTION'},{status:400});
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Release action failed',code:'RELEASE_ACTION_FAILED'},{status:400});}
}