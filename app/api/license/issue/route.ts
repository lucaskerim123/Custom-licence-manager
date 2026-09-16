import {NextResponse} from 'next/server';
import {integrationAuthorized} from '../../../../lib/auth';
import {issueLicense} from '../../../../lib/core/licenses';
import {db} from '../../../../lib/db';

export async function POST(request:Request){
  const auth=await integrationAuthorized(request,'license.issue');
  if(!auth)return NextResponse.json({error:'UNAUTHORIZED',code:'UNAUTHORIZED'},{status:401});
  const body=await request.json().catch(()=>null);
  const productId=String(body?.product_id||'').trim();
  const productSlug=String(body?.product||body?.product_code||body?.productCode||'').trim().toLowerCase();
  if(!productId&&!productSlug)return NextResponse.json({error:'product is required',code:'PRODUCT_REQUIRED'},{status:400});
  const settings=(await db().query('select system_enabled,licensing_enabled,maintenance_mode from system_settings where id=true')).rows[0];
  if(!settings?.system_enabled||!settings?.licensing_enabled||settings.maintenance_mode)return NextResponse.json({error:'License authority unavailable',code:'LICENSE_AUTHORITY_UNAVAILABLE'},{status:503});
  const product=(await db().query(productId?"select id from products where id=$1 and status='active'":"select id from products where slug=$1 and status='active'",[productId||productSlug])).rows[0];
  if(!product)return NextResponse.json({error:'Product not found or disabled',code:'PRODUCT_NOT_FOUND'},{status:404});
  try{
    const result=await issueLicense({productId:product.id,customerExternalId:body?.customer_external_id,externalReference:body?.external_reference,expiresAt:body?.expires_at?new Date(body.expires_at):null,actor:`api:${auth.name}`,metadata:body?.metadata});
    const license={id:result.id,license_key:result.key,license_id:result.id,status:result.status,issued_at:result.issued_at,expires_at:result.expires_at,already_issued:Boolean((result as any).alreadyIssued)};
    return NextResponse.json({...license,license});
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Unable to issue license',code:'LICENSE_ISSUE_FAILED'},{status:500});}
}
