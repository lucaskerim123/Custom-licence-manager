import { NextResponse } from 'next/server';
import { integrationAuthorized } from '../../../../../../lib/auth';
import { publishRelease } from '../../../../../../lib/core/releases';

export const runtime='nodejs';

export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
  const auth=await integrationAuthorized(request,'releases.write');
  if(!auth)return NextResponse.json({error:'UNAUTHORIZED'},{status:401});
  const {id}=await params;
  try{
    const release=await publishRelease(id, null, String((auth as any).name||'integration-release-publisher'));
    if(!release)return NextResponse.json({error:'RELEASE_NOT_FOUND'},{status:404});
    return NextResponse.json({ok:true,release});
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Unable to publish release'},{status:400});}
}
