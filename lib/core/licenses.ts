import crypto from 'node:crypto';
import { db } from '../db';
import { sendPulse } from './settings';

export type LicenseStatus = 'pending' | 'active' | 'suspended' | 'revoked' | 'expired';
export type InstallationStatus = 'active' | 'locked' | 'terminated';
function hashKey(key: string) { return crypto.createHash('sha256').update(key, 'utf8').digest('hex'); }
export function generateLicenseKey() { return `LIC-${crypto.randomBytes(5).toString('hex').toUpperCase()}-${crypto.randomBytes(5).toString('hex').toUpperCase()}-${crypto.randomBytes(5).toString('hex').toUpperCase()}`; }

export async function issueLicense(input: { productId: string; customerExternalId?: string | null; customerOverride?: boolean; externalReference?: string | null; expiresAt?: Date | null; actorUserId?: string | null; actor?: string; metadata?: Record<string, unknown> }) {
  const pool=db();
  const state=(await pool.query('select system_enabled,licensing_enabled,maintenance_mode from system_settings where id=true')).rows[0];
  if(!state?.system_enabled||!state.licensing_enabled||state.maintenance_mode) throw new Error('License authority is offline');
  // OrbitFS uses one Base licence per customer. APEX, MCP and Studio are
  // component entitlements on that Base licence, never standalone licence rows.
  const productRow=(await pool.query('select slug from products where id=$1 limit 1',[input.productId])).rows[0];
  if(productRow && productRow.slug!=='orbitfs_base')throw new Error('OrbitFS add-ons are component entitlements on the Base license and cannot be issued as standalone licenses');

  // A customer has one current license per product. Retries or repeated issuance
  // requests reuse the existing non-terminal record instead of creating duplicates.
  if(input.customerExternalId){
    const existingCurrent=(await pool.query(`select l.id,l.status,l.expires_at,l.license_key_last4,l.customer_external_id,l.customer_override,l.metadata,p.slug product from licenses l join products p on p.id=l.product_id where p.id=$1 and l.customer_external_id=$2 and l.status not in ('revoked','expired') order by l.created_at desc limit 1`,[input.productId,String(input.customerExternalId)])).rows[0];
    if(existingCurrent)return {...existingCurrent,key:undefined,alreadyIssued:true};
  }
  if(input.externalReference){
    const existing=(await pool.query(`select l.id,l.status,l.expires_at,l.license_key_last4,l.customer_external_id,l.customer_override,p.slug product from licenses l join products p on p.id=l.product_id where l.external_reference=$1 and l.status not in ('revoked','expired') order by l.created_at desc limit 1`,[String(input.externalReference)])).rows[0];
    if(existing)return {...existing,key:undefined,alreadyIssued:true};
  }
  const key=generateLicenseKey();const hash=hashKey(key);
  const suppliedMetadata=input.metadata&&typeof input.metadata==='object'?input.metadata:{};
  const suppliedPolicy=(suppliedMetadata as any).license_policy&&typeof (suppliedMetadata as any).license_policy==='object'?(suppliedMetadata as any).license_policy:{};
  const metadata={...suppliedMetadata,license_policy:{...suppliedPolicy,max_installations:1}};
  const result=await pool.query(`insert into licenses(license_key_hash,license_key_last4,product_id,customer_external_id,customer_override,external_reference,expires_at,metadata) values($1,$2,$3,$4,$5,$6,$7,$8) returning id,status,expires_at,customer_external_id,customer_override`,[hash,key.slice(-4),input.productId,input.customerExternalId??null,Boolean(input.customerOverride),input.externalReference??null,input.expiresAt??null,JSON.stringify(metadata)]);
  const license=result.rows[0];
  await pool.query(`insert into audit_events(actor_user_id,actor,action,resource_type,resource_id,details) values($1,$2,'license.issue','license',$3,$4)`,[input.actorUserId??null,input.actor??'system',license.id,JSON.stringify({last4:key.slice(-4),product_id:input.productId,customer_external_id:input.customerExternalId??null,customer_override:Boolean(input.customerOverride)})]);
  return {...license,key,alreadyIssued:false};
}

export async function validateLicense(input:{key:string;productSlug:string;componentSlug?:string;installationId?:string;productVersion?:string;metadata?:Record<string,unknown>;requestIp?:string|null;userAgent?:string|null;telemetry?:Record<string,unknown>}){
  const pool=db();const state=(await pool.query('select system_enabled,licensing_enabled,maintenance_mode,validation_ttl_seconds,offline_grace_seconds,pulse_poll_seconds,max_failed_validations,allow_offline_grace,pulse_revision,pulse_at,pulse_reason from system_settings where id=true')).rows[0];
  const runtime_policy={validation_ttl_seconds:Number(state?.validation_ttl_seconds||60),offline_grace_seconds:Number(state?.offline_grace_seconds||0),pulse_poll_seconds:Number(state?.pulse_poll_seconds||15),max_failed_validations:Number(state?.max_failed_validations||3),allow_offline_grace:Boolean(state?.allow_offline_grace),pulse_revision:Number(state?.pulse_revision||0),pulse_at:state?.pulse_at??null,pulse_reason:state?.pulse_reason??null};
  if(!state?.system_enabled||!state.licensing_enabled||state.maintenance_mode)return{valid:false,code:'AUTHORITY_UNAVAILABLE' as const,status:503,runtime_policy};
  const componentSlug=input.componentSlug||input.productSlug;
  const productFamily=input.productSlug==='orbitfs'?'orbitfs':componentSlug.startsWith('orbitfs_')?'orbitfs':input.productSlug;
  if(productFamily!=='orbitfs')return{valid:false,code:'LICENSE_NOT_FOUND' as const,status:404,runtime_policy};
  const result=await pool.query(`select l.id,l.status,l.expires_at,l.metadata,p.slug component,p.status product_status from licenses l join products p on p.id=l.product_id where l.license_key_hash=$1 and p.slug like 'orbitfs_%' limit 1`,[hashKey(input.key)]);
  if(!result.rowCount)return{valid:false,code:'LICENSE_NOT_FOUND' as const,status:404,runtime_policy};
  const license=result.rows[0];
  const policy=license.metadata&&typeof license.metadata==='object'&&license.metadata.license_policy&&typeof license.metadata.license_policy==='object'?license.metadata.license_policy:{};
  const entitledComponents=policy.components&&typeof policy.components==='object'?policy.components:{};
  const componentAllowed=license.component===componentSlug||(license.component==='orbitfs_base'&&componentSlug.startsWith('orbitfs_')&&Boolean(entitledComponents[componentSlug]));
  const expired=Boolean(license.expires_at&&new Date(license.expires_at).getTime()<=Date.now());const validLicense=license.product_status==='active'&&license.status==='active'&&!expired&&componentAllowed;
  if(expired&&license.status==='active')await pool.query(`update licenses set status='expired' where id=$1 and status='active'`,[license.id]);
  let installationValid=true;
  if(validLicense&&input.installationId){
    const client=await pool.connect();
    try{
      await client.query('BEGIN');
      await client.query('select pg_advisory_xact_lock(hashtext($1))',[String(license.id)]);
      const existing=(await client.query(`select id,status from activations where license_id=$1 and installation_id=$2 limit 1`,[license.id,input.installationId])).rows[0];
      const reserved=(await client.query(`select installation_id,status from activations where license_id=$1 and installation_id<>$2 and status in ('active','locked') order by last_seen_at desc limit 1`,[license.id,input.installationId])).rows[0];
      if(reserved){
        await client.query('ROLLBACK');
        return{valid:false,code:'INSTALLATION_LIMIT_REACHED' as const,status:403,expires_at:license.expires_at??null,metadata:license.metadata??{},license_id:license.id,runtime_policy};
      }
      if(existing?.status==='locked'){
        installationValid=false;
      }else{
        const t=input.telemetry&&typeof input.telemetry==='object'?input.telemetry:{};
        await client.query(`insert into activations(license_id,installation_id,product_version,status,metadata,last_ip,last_user_agent,last_hostname,last_platform,last_architecture,last_client,last_client_version,last_provider,last_region,current_components) values($1,$2,$3,'active',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) on conflict(license_id,installation_id) do update set status='active',last_seen_at=now(),product_version=coalesce(excluded.product_version,activations.product_version),metadata=coalesce(activations.metadata,'{}'::jsonb)||excluded.metadata,last_ip=coalesce(excluded.last_ip,activations.last_ip),last_user_agent=coalesce(excluded.last_user_agent,activations.last_user_agent),last_hostname=coalesce(excluded.last_hostname,activations.last_hostname),last_platform=coalesce(excluded.last_platform,activations.last_platform),last_architecture=coalesce(excluded.last_architecture,activations.last_architecture),last_client=coalesce(excluded.last_client,activations.last_client),last_client_version=coalesce(excluded.last_client_version,activations.last_client_version),last_provider=coalesce(excluded.last_provider,activations.last_provider),last_region=coalesce(excluded.last_region,activations.last_region),current_components=case when excluded.current_components<>'{}'::jsonb then excluded.current_components else activations.current_components end`,[license.id,input.installationId,input.productVersion??null,JSON.stringify(input.metadata??{}),input.requestIp??null,input.userAgent??null,t.hostname?t.hostname:null,t.platform?t.platform:null,t.architecture?t.architecture:null,t.client?t.client:null,t.clientVersion?t.clientVersion:null,t.provider?t.provider:null,t.region?t.region:null,t.components&&typeof t.components==='object'?JSON.stringify(t.components):'{}']);
      }
      await client.query('COMMIT');
    }catch(error){
      try{await client.query('ROLLBACK')}catch{}
      throw error;
    }finally{client.release()}
  }
  const valid=validLicense&&installationValid;
  const code=valid?'LICENSE_VALID':!componentAllowed?'COMPONENT_NOT_ENTITLED':!installationValid?'INSTALLATION_LOCKED_OR_TERMINATED':expired?'LICENSE_EXPIRED':license.product_status!=='active'?'PRODUCT_DISABLED':`LICENSE_${String(license.status).toUpperCase()}`;
  return{valid,code,status:valid?200:403,expires_at:license.expires_at??null,metadata:license.metadata??{},license_id:license.id,runtime_policy};
}

export async function deleteLicense(id:string,actorUserId?:string|null,actor?:string){
  const pool=db(); const client=await pool.connect();
  try{
    await client.query('BEGIN');
    const current=(await client.query('select id,customer_external_id,product_id,status from licenses where id=$1 for update',[id])).rows[0];
    if(!current) throw new Error('License not found');
    await client.query('delete from licenses where id=$1',[id]);
    await client.query(`insert into audit_events(actor_user_id,actor,action,resource_type,resource_id,details) values($1,$2,'license.delete','license',$3,$4)`,[actorUserId??null,actor??'system',id,JSON.stringify({customer_external_id:current.customer_external_id,product_id:current.product_id,status:current.status,key_destroyed:true})]);
    await client.query('COMMIT'); await sendPulse(actorUserId??null,actor??'system','license-deleted',{license_id:id}); return {id,deleted:true};
  }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
}

export async function setLicenseStatus(id:string,status:LicenseStatus,actorUserId?:string|null,actor?:string){const result=await db().query(`update licenses set status=$1 where id=$2 returning id,status`,[status,id]);if(!result.rowCount)throw new Error('License not found');await db().query(`insert into audit_events(actor_user_id,actor,action,resource_type,resource_id,details) values($1,$2,'license.status','license',$3,$4)`,[actorUserId??null,actor??'system',id,JSON.stringify({status})]);const pulse=await sendPulse(actorUserId??null,actor??'system',`license-${status}`,{license_id:id,status});return {...result.rows[0],pulse};}

export async function setInstallationStatus(id:string,status:InstallationStatus,actorUserId?:string|null,actor?:string){const pool=db();const current=(await pool.query('select id,license_id,installation_id,status from activations where id=$1 limit 1',[id])).rows[0];if(!current)throw new Error('Installation not found');if(status==='active'){const reserved=(await pool.query("select id from activations where license_id=$1 and id<>$2 and status in ('active','locked') limit 1",[current.license_id,id])).rows[0];if(reserved)throw new Error('This licence is already bound to another installation');}const result=await pool.query(`update activations set status=$1,last_seen_at=now() where id=$2 returning id,license_id,installation_id,status,last_seen_at`,[status,id]);await db().query(`insert into audit_events(actor_user_id,actor,action,resource_type,resource_id,details) values($1,$2,'installation.status','activation',$3,$4)`,[actorUserId??null,actor??'system',id,JSON.stringify({status})]);const row=result.rows[0];const pulse=await sendPulse(actorUserId??null,actor??'system',`installation-${status}`,{activation_id:id,license_id:row.license_id,installation_id:row.installation_id,status});return {...row,pulse};}

export async function rotateLicense(id:string,actorUserId?:string|null,actor?:string){
  const pool=db();
  const current=(await pool.query(`select l.id,l.status,l.expires_at,l.license_key_last4,l.customer_external_id,l.customer_override,l.metadata,p.id product_id from licenses l join products p on p.id=l.product_id where l.id=$1 limit 1`,[id])).rows[0];
  if(!current)throw new Error('License not found');

  // Rotation is a credential replacement, not a new license. Reuse the same
  // database row whenever the license is not terminal. This keeps one current
  // license record per customer/product while replacing only its secret.
  if(current.status!=='revoked' && current.status!=='expired'){
    const key=generateLicenseKey();
    const previousLast4=current.license_key_last4||null;
    const result=await pool.query(
      `update licenses
       set license_key_hash=$1,
           license_key_last4=$2
       where id=$3
       returning id,status,expires_at,customer_external_id,customer_override`,
      [hashKey(key),key.slice(-4),id],
    );
    const replacement=result.rows[0];
    await pool.query(
      `insert into audit_events(actor_user_id,actor,action,resource_type,resource_id,details)
       values($1,$2,'license.rotate','license',$3,$4)`,
      [actorUserId??null,actor??'system',id,JSON.stringify({reused_license_id:id,previous_last4:previousLast4,rotated_in_place:true})],
    );
    const pulse=await sendPulse(actorUserId??null,actor??'system','license-key-rotated',{license_id:id});
    return {...replacement,key,alreadyIssued:false,pulse};
  }

  // Rotation never issues a second license record. Terminal licenses are
  // historical records and must be explicitly reissued through the issuance flow.
  throw new Error('Only an active or suspended license can be rotated');
}


export async function recordInstallationCheckIn(input:{
  licenseId:string;
  installationId:string;
  action:'check_in'|'deploy'|'update'|'redeploy'|'rollback';
  phase:'authorize'|'started'|'completed'|'failed';
  product:string;
  productVersion?:string|null;
  previousVersion?:string|null;
  releaseId?:string|null;
  deploymentId?:string|null;
  deploymentUrl?:string|null;
  projectId?:string|null;
  projectName?:string|null;
  provider?:string|null;
  region?:string|null;
  platform?:string|null;
  architecture?:string|null;
  hostname?:string|null;
  client?:string|null;
  clientVersion?:string|null;
  sourceIp?:string|null;
  userAgent?:string|null;
  customerIdentity?:Record<string,unknown>|null;
  details?:Record<string,unknown>;
}) {
  const pool=db();
  const license=(await pool.query('select id,status,expires_at from licenses where id=$1 limit 1',[input.licenseId])).rows[0];
  if(!license) throw Object.assign(new Error('License not found'),{code:'LICENSE_NOT_FOUND',status:404});
  if(license.status!=='active'||(license.expires_at&&new Date(license.expires_at).getTime()<=Date.now())) throw Object.assign(new Error('License is not active'),{code:'LICENSE_NOT_ELIGIBLE',status:403});
  let activation=(await pool.query('select id,status from activations where license_id=$1 and installation_id=$2 limit 1',[input.licenseId,input.installationId])).rows[0];
  if(!activation && input.action==='deploy'){
    const client=await pool.connect();
    try{
      await client.query('BEGIN');
      await client.query('select pg_advisory_xact_lock(hashtext($1))',[String(input.licenseId)]);
      const reserved=(await client.query("select id from activations where license_id=$1 and status in ('active','locked') limit 1",[input.licenseId])).rows[0];
      if(reserved)throw Object.assign(new Error('License is already bound to another installation'),{code:'INSTALLATION_LIMIT_REACHED',status:403});
      activation=(await client.query(`insert into activations(license_id,installation_id,product_version,status,metadata,last_ip,last_user_agent,last_client,last_client_version,last_provider,last_region,current_components) values($1,$2,$3,'active',$4,$5,$6,$7,$8,$9,$10,$11) returning id,status`,[
      input.licenseId,input.installationId,input.productVersion??null,JSON.stringify(input.details??{}),input.sourceIp??null,input.userAgent??null,input.client??null,input.clientVersion??null,input.provider??null,input.region??null,JSON.stringify((input.details&&typeof input.details==='object'&&input.details.components&&typeof input.details.components==='object')?input.details.components:{})
    ])).rows[0];
      await client.query('COMMIT');
    }catch(error){try{await client.query('ROLLBACK')}catch{}throw error;}finally{client.release()}
  }
  if(!activation) throw Object.assign(new Error('Installation is not registered for this license'),{code:'INSTALLATION_NOT_REGISTERED',status:403});
  if(activation.status!=='active') throw Object.assign(new Error('Installation is locked or terminated'),{code:'INSTALLATION_LOCKED_OR_TERMINATED',status:403});
  const details=input.details&&typeof input.details==='object'?input.details:{};
  const components=(details.components&&typeof details.components==='object')?details.components:{};
  await pool.query('insert into deployment_events(license_id,activation_id,installation_id,release_id,action,phase,product,product_version,previous_version,deployment_id,deployment_url,project_id,project_name,provider,region,platform,architecture,hostname,client,client_version,source_ip,user_agent,customer_identity,details) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24)',[
    input.licenseId,activation.id,input.installationId,input.releaseId??null,input.action,input.phase,input.product,input.productVersion??null,input.previousVersion??null,input.deploymentId??null,input.deploymentUrl??null,input.projectId??null,input.projectName??null,input.provider??null,input.region??null,input.platform??null,input.architecture??null,input.hostname??null,input.client??null,input.clientVersion??null,input.sourceIp??null,input.userAgent??null,JSON.stringify(input.customerIdentity??{}),JSON.stringify(details)
  ]);
  await pool.query(`update activations set last_seen_at=now(),last_ip=coalesce($3,last_ip),last_user_agent=coalesce($4,last_user_agent),last_hostname=coalesce($5,last_hostname),last_platform=coalesce($6,last_platform),last_architecture=coalesce($7,last_architecture),last_client=coalesce($8,last_client),last_client_version=coalesce($9,last_client_version),last_provider=coalesce($10,last_provider),last_region=coalesce($11,last_region),last_deployment_id=coalesce($12,last_deployment_id),last_deployment_url=coalesce($13,last_deployment_url),last_deployment_status=$14,last_operation=$15,product_version=coalesce($16,product_version),deployment_count=deployment_count+case when $17=true then 1 else 0 end,current_components=case when $18::jsonb<>'{}'::jsonb then $18::jsonb else current_components end,metadata=coalesce(metadata,'{}'::jsonb)||$19::jsonb where id=$1`,[activation.id,input.licenseId,input.sourceIp??null,input.userAgent??null,input.hostname??null,input.platform??null,input.architecture??null,input.client??null,input.clientVersion??null,input.provider??null,input.region??null,input.deploymentId??null,input.deploymentUrl??null,input.phase,input.action,input.productVersion??null,input.phase==='completed',JSON.stringify(components),JSON.stringify(details)]);
  return {ok:true,activationId:activation.id,installationId:input.installationId};
}
