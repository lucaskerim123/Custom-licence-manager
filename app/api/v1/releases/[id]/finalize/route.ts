import { NextResponse } from 'next/server';
import { integrationAuthorized } from '../../../../../../lib/auth';
import { db } from '../../../../../../lib/db';
import { validateRelease, setReleaseReview } from '../../../../../../lib/core/releases';

export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
  if(!(await integrationAuthorized(request,'releases.write'))) return NextResponse.json({error:'UNAUTHORIZED'},{status:401});
  const {id}=await params;
  try{
    const row=await validateRelease(id,null,'license-master-finalise');
    if(!row) return NextResponse.json({error:'RELEASE_NOT_FOUND'},{status:404});
    const validation=row.manifest?.validation;
    if(validation?.status!=='passed') return NextResponse.json({error:'RELEASE_VALIDATION_FAILED',validation},{status:409});
    const approved=await setReleaseReview(id,'approved',null,'license-master-finalise');
    return NextResponse.json({ok:true,finalised:true,release:approved,validation});
  }catch(error){
    return NextResponse.json({error:error instanceof Error?error.message:'Unable to finalise release'},{status:503});
  }
}