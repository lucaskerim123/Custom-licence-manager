import { NextResponse } from 'next/server';
import { integrationAuthorized } from '../../../../../../lib/auth';
import { validateRelease } from '../../../../../../lib/core/releases';

export const runtime='nodejs';

export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
  const auth=await integrationAuthorized(request,'releases.write');
  if(!auth)return NextResponse.json({error:'UNAUTHORIZED'},{status:401});
  const {id}=await params;
  try{const release=await validateRelease(id,null,String((auth as any).name||'integration-release-validator'));if(!release)return NextResponse.json({error:'RELEASE_NOT_FOUND'},{status:404});return NextResponse.json({ok:true,release,validation:release.manifest?.validation||null});}
  catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Unable to validate release'},{status:400});}
}
