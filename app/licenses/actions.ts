'use server';
import { issueLicense } from '../../lib/core/licenses';
import { db } from '../../lib/db';
import { requireUser } from '../../lib/session';

export async function issueLicenseAction(_prev:{ok:boolean,key:string,error:string}, formData:FormData){
  const user=await requireUser();
  if(!['owner','admin','operator'].includes(user.role)) return {ok:false,key:'',error:'You do not have permission to issue licenses'};
  const productId=String(formData.get('product_id')||'');
  if(!productId) return {ok:false,key:'',error:'Select a product'};
  const product=(await db().query("select id from products where id=$1 and status='active'",[productId])).rows[0];
  if(!product) return {ok:false,key:'',error:'Product not found or disabled'};
  const expires=String(formData.get('expires')||'');
  let expiresAt:Date|null=null;
  if(expires){expiresAt=new Date(expires);if(Number.isNaN(expiresAt.getTime()))return {ok:false,key:'',error:'Invalid expiry'};}
  try{
    const result=await issueLicense({productId,customerExternalId:String(formData.get('customer')||'')||null,externalReference:String(formData.get('reference')||'')||null,expiresAt,actorUserId:user.id,actor:user.email});
    return {ok:true,key:result.key,error:''};
  }catch(e){return {ok:false,key:'',error:e instanceof Error?e.message:'Unable to issue license'};}
}
