import { NextResponse } from 'next/server';
import { integrationAuthorized } from '../../../../../lib/auth';
import { db } from '../../../../../lib/db';
import { issueLicense, setLicenseStatus } from '../../../../../lib/core/licenses';

export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
  const auth=await integrationAuthorized(request,'license.manage');
  if(!auth)return NextResponse.json({error:'Unauthorized'},{status:401});
  const {id}=await params;
  const body=await request.json().catch(()=>({}));
  const action=String(body?.action||'').trim().toLowerCase();
  if(!['rotate','unlock','suspend','revoke','activate'].includes(action))return NextResponse.json({error:'Unsupported license control action'},{status:400});
  const current=(await db().query(`select l.id,l.status,l.expires_at,l.customer_external_id,l.external_reference,l.metadata,p.id product_id,p.slug product from licenses l join products p on p.id=l.product_id where l.id=$1 limit 1`,[id])).rows[0];
  if(!current)return NextResponse.json({error:'License not found'},{status:404});
  try{
    if(action==='rotate'){
      const replacement=await issueLicense({productId:current.product_id,customerExternalId:current.customer_external_id,externalReference:current.external_reference,expiresAt:current.expires_at?new Date(current.expires_at):null,metadata:{...(current.metadata||{}),rotated_from:id}});
      await setLicenseStatus(id,'revoked',null,'external-integration');
      return NextResponse.json({ok:true,action,license:replacement,previous_license_id:id,message:'License rotated. The new key is returned once and is never stored in plaintext.'});
    }
    const status=action==='unlock'||action==='activate'?'active':action==='suspend'?'suspended':'revoked';
    const result=await setLicenseStatus(id,status,null,'external-integration');
    return NextResponse.json({ok:true,action,license:result,message:action==='unlock'?'License installation unlocked.':`License ${action} completed.`});
  }catch(e){return NextResponse.json({error:e instanceof Error?e.message:'License control failed'},{status:503});}
}
