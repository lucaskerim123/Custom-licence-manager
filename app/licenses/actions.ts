'use server';
import { issueLicense, rotateLicense, setInstallationStatus, setLicenseStatus, deleteLicense } from '../../lib/core/licenses';
import { db } from '../../lib/db';
import { requireUser } from '../../lib/session';

const roles=['owner','admin','operator'];
export async function issueLicenseAction(_prev:{ok:boolean,key:string,error:string}, formData:FormData){
  const user=await requireUser();
  if(!roles.includes(user.role)) return {ok:false,key:'',error:'You do not have permission to issue licenses'};
  const productId=String(formData.get('product_id')||'');
  if(!productId) return {ok:false,key:'',error:'Select a product'};
  const product=(await db().query("select id from products where id=$1 and status='active'",[productId])).rows[0];
  if(!product) return {ok:false,key:'',error:'Product not found or disabled'};
  const customer=String(formData.get('customer')||'').trim();
  const customerOverride=customer.toUpperCase()==='ADMIN';
  const expires=String(formData.get('expires')||'');
  let expiresAt:Date|null=null;
  if(expires){expiresAt=new Date(expires);if(Number.isNaN(expiresAt.getTime()))return {ok:false,key:'',error:'Invalid expiry'};}
  try{
    const result=await issueLicense({productId,customerExternalId:customer||null,customerOverride,externalReference:String(formData.get('reference')||'')||null,expiresAt,actorUserId:user.id,actor:user.email,metadata:customerOverride?{issuance_mode:'admin_override'}:{}});
    return {ok:true,key:result.key,error:''};
  }catch(e){return {ok:false,key:'',error:e instanceof Error?e.message:'Unable to issue license'};}
}

export async function rotateLicenseAction(_prev:{ok:boolean,key:string,error:string}, formData:FormData){
  const user=await requireUser();
  if(!roles.includes(user.role)) return {ok:false,key:'',error:'You do not have permission to control licenses'};
  const id=String(formData.get('id')||'');const action=String(formData.get('action')||'');const installationId=String(formData.get('installation_id')||'');
  if(!id)return {ok:false,key:'',error:'License id is required'};
  try{
    if(action==='rotate'){const replacement=await rotateLicense(id,user.id,user.email);return {ok:true,key:replacement.key,error:''};}
    if(action==='suspend'||action==='activate'||action==='revoke'){await setLicenseStatus(id,action==='activate'?'active':action==='suspend'?'suspended':'revoked',user.id,user.email);return {ok:true,key:'',error:''};}
  if(installationId&&['unlock','lock','terminate'].includes(action)){
    const activation=(await db().query('select id from activations where id=$1 and license_id=$2',[installationId,id])).rows[0];
    if(activation)await setInstallationStatus(activation.id,action==='unlock'?'active':action==='lock'?'locked':'terminated',user.id,user.email);
  }
    return {ok:true,key:'',error:''};
  }catch(e){return {ok:false,key:'',error:e instanceof Error?e.message:'License control failed'};}
}

export async function licenseControlAction(formData:FormData){
  const user=await requireUser();
  if(!roles.includes(user.role)) return;
  const id=String(formData.get('id')||'');const action=String(formData.get('action')||'');const installationId=String(formData.get('installation_id')||'');
  if(!id)return;
  if(action==='suspend'||action==='activate'||action==='revoke'){await setLicenseStatus(id,action==='activate'?'active':action==='suspend'?'suspended':'revoked',user.id,user.email);return;}
  if(action==='delete'){await deleteLicense(id,user.id,user.email);return;}
  if(installationId&&['unlock','lock','terminate'].includes(action)){
    const activation=(await db().query('select id from activations where id=$1 and license_id=$2',[installationId,id])).rows[0];
    if(activation)await setInstallationStatus(activation.id,action==='unlock'?'active':action==='lock'?'locked':'terminated',user.id,user.email);
  }
}
