import { db } from '../db';

export function normalizeProductSlug(value:string){const slug=String(value||'').trim().toLowerCase();return slug==='orbitfs'?'orbitfs_base':slug;}

export async function createProduct(input:{name:string;slug:string;description?:string|null;actorUserId?:string|null;actor?:string}){
  const result=await db().query(`insert into products(name,slug,description) values($1,$2,$3) returning *`,[input.name,input.slug,input.description??null]);
  const row=result.rows[0];
  await db().query(`insert into audit_events(actor_user_id,actor,action,resource_type,resource_id,details) values($1,$2,'product.create','product',$3,$4)`,[input.actorUserId??null,input.actor??'system',row.id,JSON.stringify({slug:input.slug})]);
  return row;
}

export async function listProducts(){return (await db().query('select * from products order by created_at desc')).rows;}

export async function setProductStatus(id:string,status:'active'|'disabled'|'archived',actorUserId?:string|null,actor?:string){const result=await db().query('update products set status=$1 where id=$2 returning *',[status,id]);if(!result.rowCount)throw new Error('Product not found');await db().query(`insert into audit_events(actor_user_id,actor,action,resource_type,resource_id,details) values($1,$2,'product.status','product',$3,$4)`,[actorUserId??null,actor??'system',id,JSON.stringify({status})]);return result.rows[0];}
