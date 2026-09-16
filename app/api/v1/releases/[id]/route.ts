import { NextResponse } from 'next/server';
import { integrationAuthorized } from '../../../../../lib/auth';
import { db } from '../../../../../lib/db';
import { publishRelease } from '../../../../../lib/core/releases';

export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}){
  if(!integrationAuthorized(request))return NextResponse.json({error:'UNAUTHORIZED'},{status:401});
  const {id}=await params;
  const body=await request.json().catch(()=>null);
  try{
    const current=(await db().query('select id,review_status,status from releases where id=$1',[id])).rows[0];
    if(!current)return NextResponse.json({error:'RELEASE_NOT_FOUND'},{status:404});
    if(body?.publish===true){
      if(current.review_status!=='approved')return NextResponse.json({error:'RELEASE_NOT_APPROVED'},{status:409});
      const row=await publishRelease(id,null,'billing-store');
      return row?NextResponse.json({release:row}):NextResponse.json({error:'RELEASE_NOT_FOUND'},{status:404});
    }
    const allowed=['notes','channel'];
    const updates:string[]=[];const values:any[]=[];let i=1;
    for(const field of allowed){if(Object.prototype.hasOwnProperty.call(body??{},field)){updates.push(`${field}=$${i++}`);values.push(String(body[field]??''));}}
    if(!updates.length)return NextResponse.json({error:'NO_CHANGES'},{status:400});
    values.push(id);
    const row=(await db().query(`update releases set ${updates.join(',')} where id=$${i} and review_status='approved' returning *`,values)).rows[0];
    if(!row)return NextResponse.json({error:'RELEASE_NOT_APPROVED'},{status:409});
    return NextResponse.json({release:row});
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Unable to update release'},{status:503});}
}
