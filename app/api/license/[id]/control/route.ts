import { NextResponse } from 'next/server';
import { integrationAuthorized } from '../../../../../lib/auth';
import { db } from '../../../../../lib/db';
import { rotateLicense, setInstallationStatus, setLicenseStatus } from '../../../../../lib/core/licenses';

export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
  const auth=await integrationAuthorized(request,'license.manage');
  if(!auth)return NextResponse.json({error:'Unauthorized'},{status:401});
  const {id}=await params;
  const body=await request.json().catch(()=>({}));
  const action=String(body?.action||'').trim().toLowerCase();
  const installationId=String(body?.installation_id||body?.installationId||'').trim();
  if(!['rotate','unlock','suspend','terminate','revoke','activate','lock-installation','unlock-installation','terminate-installation'].includes(action))return NextResponse.json({error:'Unsupported license control action'},{status:400});
  const current=(await db().query(`select l.id,l.status,l.expires_at,l.customer_external_id,l.customer_override,l.external_reference,l.metadata,p.id product_id,p.slug product from licenses l join products p on p.id=l.product_id where l.id=$1 limit 1`,[id])).rows[0];
  if(!current)return NextResponse.json({error:'License not found'},{status:404});
  try{
    if(action==='rotate'){
      const replacement=await rotateLicense(id,null,'external-integration');
      return NextResponse.json({ok:true,action,license:replacement,previous_license_id:id,message:'License rotated. The new key is returned once and is never stored in plaintext.'});
    }
    if(['unlock','lock-installation','unlock-installation','terminate-installation'].includes(action)){
      if(!installationId)return NextResponse.json({error:'installation_id is required for installation control'},{status:400});
      const activation=(await db().query(`select id from activations where license_id=$1 and installation_id=$2 limit 1`,[id,installationId])).rows[0];
      if(!activation)return NextResponse.json({error:'Installation not found for this license'},{status:404});
      const status=action==='unlock' || action==='unlock-installation' ? 'active' : action==='terminate-installation' ? 'terminated' : 'locked';
      const result=await setInstallationStatus(activation.id,status,null,'external-integration');
      return NextResponse.json({ok:true,action,installation:result});
    }
    const status=action==='activate'?'active':action==='suspend'?'suspended':'revoked';
    const result=await setLicenseStatus(id,status,null,'external-integration');
    return NextResponse.json({ok:true,action,license:result,message:action==='revoke'||action==='terminate'?'License terminated.':`License ${action} completed.`});
  }catch(e){return NextResponse.json({error:e instanceof Error?e.message:'License control failed'},{status:503});}
}
