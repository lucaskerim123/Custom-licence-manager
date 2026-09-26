'use server';
import { issueLicense, rotateLicense, setInstallationStatus, setLicenseStatus, deleteLicense } from '../../lib/core/licenses';
import { db } from '../../lib/db';
import { sendPulse } from '../../lib/core/settings';
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


export async function updateLicenseAction(_prev:{ok:boolean,error:string}, formData:FormData){
  const user=await requireUser();
  if(!roles.includes(user.role))return {ok:false,error:'You do not have permission to edit licenses'};
  const id=String(formData.get('id')||'').trim();
  if(!id)return {ok:false,error:'License id is required'};
  try{
    const current=(await db().query(`select l.id,l.customer_external_id,l.external_reference,l.expires_at,l.metadata,l.status,p.slug product from licenses l join products p on p.id=l.product_id where l.id=$1 limit 1`,[id])).rows[0];
    if(!current)return {ok:false,error:'License not found'};
    const customer=String(formData.get('customer_external_id')||'').trim()||null;
    const reference=String(formData.get('external_reference')||'').trim()||null;
    const expires=String(formData.get('expires_at')||'').trim();
    let expiresAt:Date|null=null;
    if(expires){expiresAt=new Date(expires);if(Number.isNaN(expiresAt.getTime()))return {ok:false,error:'Invalid expiry'};}
    const maxInstallationsRaw=Number(formData.get('max_installations')||0);
    const existingPolicy=current.metadata&&typeof current.metadata==='object'&&current.metadata.license_policy&&typeof current.metadata.license_policy==='object'?current.metadata.license_policy:{};
    let components:any=existingPolicy.components&&typeof existingPolicy.components==='object'?{...existingPolicy.components}:{};
    if(current.product==='orbitfs_base'){
      components={
        orbitfs_base:true,
        orbitfs_apex:formData.get('orbitfs_apex')==='on',
        orbitfs_mcp:formData.get('orbitfs_mcp')==='on',
        orbitfs_studio:formData.get('orbitfs_studio')==='on'
      };
    }
    const policy={...existingPolicy,...(current.product==='orbitfs_base'?{components}:{}),...(maxInstallationsRaw>0?{max_installations:Math.min(100,Math.max(1,Math.floor(maxInstallationsRaw)))}:{})};
    const metadata={...(current.metadata||{}),license_policy:policy};
    const updated=(await db().query(`update licenses set customer_external_id=$2,external_reference=$3,expires_at=$4,metadata=$5 where id=$1 returning id,status,customer_external_id,external_reference,expires_at,metadata`,[id,customer,reference,expiresAt,JSON.stringify(metadata)])).rows[0];
    await db().query(`insert into audit_events(actor_user_id,actor,action,resource_type,resource_id,details) values($1,$2,'license.update','license',$3,$4)`,[user.id,user.email,id,JSON.stringify({before:{customer_external_id:current.customer_external_id,external_reference:current.external_reference,expires_at:current.expires_at,license_policy:existingPolicy},after:{customer_external_id:customer,external_reference:reference,expires_at:expiresAt,license_policy:policy}})]);
    await sendPulse(user.id,user.email,'license-updated',{license_id:id,customer_external_id:customer,components});
    return {ok:true,error:''};
  }catch(e){return {ok:false,error:e instanceof Error?e.message:'Unable to update license'};}
}
