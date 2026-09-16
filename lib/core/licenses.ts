import crypto from 'node:crypto';
import { db } from '../db';

export type LicenseStatus = 'pending' | 'active' | 'suspended' | 'revoked' | 'expired';
function hashKey(key: string) { return crypto.createHash('sha256').update(key, 'utf8').digest('hex'); }
export function generateLicenseKey() { return `LIC-${crypto.randomBytes(5).toString('hex').toUpperCase()}-${crypto.randomBytes(5).toString('hex').toUpperCase()}-${crypto.randomBytes(5).toString('hex').toUpperCase()}`; }

export async function issueLicense(input: { productId: string; customerExternalId?: string | null; externalReference?: string | null; expiresAt?: Date | null; actorUserId?: string | null; actor?: string; metadata?: Record<string, unknown> }) {
  const pool=db();
  const state=(await pool.query('select system_enabled,licensing_enabled,maintenance_mode from system_settings where id=true')).rows[0];
  if(!state?.system_enabled||!state.licensing_enabled||state.maintenance_mode) throw new Error('License authority is offline');
  if(input.externalReference){
    const existing=(await pool.query('select l.id,l.status,l.expires_at,l.license_key_last4,p.slug product from licenses l join products p on p.id=l.product_id where l.external_reference=$1 order by l.created_at asc limit 1',[String(input.externalReference)])).rows[0];
    if(existing)return {...existing,key:undefined,alreadyIssued:true};
  }
  const key=generateLicenseKey();const hash=hashKey(key);
  const result=await pool.query(`insert into licenses(license_key_hash,license_key_last4,product_id,customer_external_id,external_reference,expires_at,metadata) values($1,$2,$3,$4,$5,$6,$7) returning id,status,expires_at`,[hash,key.slice(-4),input.productId,input.customerExternalId??null,input.externalReference??null,input.expiresAt??null,JSON.stringify(input.metadata??{})]);
  const license=result.rows[0];
  await pool.query(`insert into audit_events(actor_user_id,actor,action,resource_type,resource_id,details) values($1,$2,'license.issue','license',$3,$4)`,[input.actorUserId??null,input.actor??'system',license.id,JSON.stringify({last4:key.slice(-4),product_id:input.productId})]);
  return {...license,key,alreadyIssued:false};
}

export async function validateLicense(input:{key:string;productSlug:string;installationId?:string;productVersion?:string;metadata?:Record<string,unknown>}){
  const pool=db();const state=(await pool.query('select system_enabled,licensing_enabled,maintenance_mode from system_settings where id=true')).rows[0];
  if(!state?.system_enabled||!state.licensing_enabled||state.maintenance_mode)return{valid:false,code:'AUTHORITY_UNAVAILABLE' as const,status:503};
  const result=await pool.query(`select l.id,l.status,l.expires_at,l.metadata,p.slug product,p.status product_status from licenses l join products p on p.id=l.product_id where l.license_key_hash=$1 and p.slug=$2 limit 1`,[hashKey(input.key),input.productSlug]);
  if(!result.rowCount)return{valid:false,code:'LICENSE_NOT_FOUND' as const,status:404};
  const license=result.rows[0];const expired=Boolean(license.expires_at&&new Date(license.expires_at).getTime()<=Date.now());const valid=license.product_status==='active'&&license.status==='active'&&!expired;
  if(expired&&license.status==='active')await pool.query(`update licenses set status='expired' where id=$1 and status='active'`,[license.id]);
  if(valid&&input.installationId)await pool.query(`insert into activations(license_id,installation_id,product_version,metadata) values($1,$2,$3,$4) on conflict(license_id,installation_id) do update set last_seen_at=now(),product_version=excluded.product_version,metadata=excluded.metadata`,[license.id,input.installationId,input.productVersion??null,JSON.stringify(input.metadata??{})]);
  const code=valid?'LICENSE_VALID':expired?'LICENSE_EXPIRED':license.product_status!=='active'?'PRODUCT_DISABLED':`LICENSE_${String(license.status).toUpperCase()}`;
  return{valid,code,status:valid?200:403,expires_at:license.expires_at??null,metadata:license.metadata??{},license_id:license.id};
}

export async function setLicenseStatus(id:string,status:LicenseStatus,actorUserId?:string|null,actor?:string){const result=await db().query(`update licenses set status=$1 where id=$2 returning id,status`,[status,id]);if(!result.rowCount)throw new Error('License not found');await db().query(`insert into audit_events(actor_user_id,actor,action,resource_type,resource_id,details) values($1,$2,'license.status','license',$3,$4)`,[actorUserId??null,actor??'system',id,JSON.stringify({status})]);return result.rows[0];}
