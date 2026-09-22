import {NextResponse} from 'next/server';
import {integrationAuthorized} from '../../../../../../lib/auth';
import {db} from '../../../../../../lib/db';
export const runtime='nodejs';
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){
  const auth=await integrationAuthorized(request,'releases.read');if(!auth)return NextResponse.json({error:'UNAUTHORIZED',code:'UNAUTHORIZED'},{status:401});
  const {id}=await params;const row=(await db().query("select artifact_url,artifact_name from releases where id=$1 limit 1",[id])).rows[0];
  if(!row)return NextResponse.json({error:'RELEASE_NOT_FOUND'},{status:404}); if(!row.artifact_url)return NextResponse.json({error:'ARTIFACT_NOT_CONFIGURED',code:'ARTIFACT_NOT_CONFIGURED'},{status:404});
  return NextResponse.redirect(String(row.artifact_url),{status:307});
}
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
  return NextResponse.json({error:'ARTIFACT_UPLOAD_NOT_SUPPORTED',code:'ARTIFACT_UPLOAD_NOT_SUPPORTED',message:'Release artifacts are produced and supplied by the GitHub release workflow. Provide artifact_url, artifact_name, artifact_run_id and checksum during release intake.'},{status:409});
}