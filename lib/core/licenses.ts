import crypto from 'node:crypto';
import { db } from '../db';

export type LicenseStatus = 'pending' | 'active' | 'suspended' | 'revoked' | 'expired';
export type InstallationStatus = 'active' | 'locked' | 'terminated';
function hashKey(key: string) { return crypto.createHash('sha256').update(key, 'utf8').digest('hex'); }
export function generateLicenseKey() { return `LIC-${crypto.randomBytes(5).toString('hex').toUpperCase()}-${crypto.randomBytes(5).toString('hex').toUpperCase()}-${crypto.randomBytes(5).toString('hex').toUpperCase()}`; }

export async function issueLicense(input: { productId: string; customerExternalId?: string | null; customerOverride?: boolean; externalReference?: string | null; expiresAt?: Date | null; actorUserId?: string | null; actor?: string; metadata?: Record<string, unknown> }) {
  const pool=db();
  const state=(await pool.query('select system_enabled,licensing_enabled,maintenance_mode from system_settings where id=true')).rows[0];
  if(!state?.system_enabled||!state.licensing_enabled||state.maintenance_mode) throw new Error('License authority is offline');
  if(input.externalReference){
    const existing=(await pool.query('select l.id,l.status,l.expires_at,l.license_key_last4,l.customer_external_id,l.customer_override,p.slug product from licenses l join products p on p.id=l.product_id where l.external_reference=$1 order by l.created_at asc limit 1',[String(input.externalReference)])).rows[0];
    if(existing)return {...existing,key:undefined,alreadyIssued:true};
  }
  const key=generateLicenseKey();const hash=hashKey(key);
  const result=await pool.query(`insert into licenses(license_key_hash,license_key_last4,product_id,customer_external_id,customer_override,external_reference,expires_at,metadata) values($1,$2,$3,$4,$5,$6,$7,$8) returning id,status,expires_at,customer_external_id,customer_override`,[hash,key.slice(-4),input.productId,input.customerExternalId??null,Boolean(input.customerOverride),input.externalReference??null,input.expiresAt??null,JSON.stringify(input.metadata??{})]);
  const license=result.rows[0];
  await pool.query(`insert into audit_events(actor_user_id,actor,action,resource_type,resource_id,details) values($1,$2,'license.issue','license',$3,$4)`,[input.actorUserId??null,input.actor??'system',license.id,JSON.stringify({last4:key.slice(-4),product_id:input.productId,customer_external_id:input.customerExternalId??null,customer_override:Boolean(input.customerOverride)})]);
  return {...license,key,alreadyIssued:false};
}

export async function validateLicense(input:{key:string;productSlug:string;installationId?:string;productVersion?:string;metadata?:Record<string,unknown>;requestIp?:string|null;userAgent?:string|null;telemetry?:Record<string,unknown>}){
  const pool=db();const state=(await pool.query('select system_enabled,licensing_enabled,maintenance_mode from system_settings where id=true')).rows[0];
  if(!state?.system_enabled||!state.licensing_enabled||state.maintenance_mode)return{valid:false,code:'AUTHORITY_UNAVAILABLE' as const,status:503};
  const result=await pool.query(`select l.id,l.status,l.expires_at,l.metadata,p.slug product,p.status product_status from licenses l join products p on p.id=l.product_id where l.license_key_hash=$1 and p.slug=$2 limit 1`,[hashKey(input.key),input.productSlug]);
  if(!result.rowCount)return{valid:false,code:'LICENSE_NOT_FOUND' as const,status:404};
  const license=result.rows[0];const expired=Boolean(license.expires_at&&new Date(license.expires_at).getTime()<=Date.now());const validLicense=license.product_status==='active'&&license.status==='active'&&!expired;
  if(expired&&license.status==='active')await pool.query(`update licenses set status='expired' where id=$1 and status='active'`,[license.id]);
  let installationValid=true;
  if(validLicense&&input.installationId){
    const existing=(await pool.query(`select status from activations where license_id=$1 and installation_id=$2 limit 1`,[license.id,input.installationId])).rows[0];
    installationValid=!existing||existing.status==='active';
    if(installationValid){
      const t=input.telemetry&&typeof input.telemetry==='object'?input.telemetry:{};
      await pool.query(`insert into activations(license_id,installation_id,product_version,status,metadata,last_ip,last_user_agent,last_hostname,last_platform,last_architecture,last_client,last_client_version,last_provider,last_region,current_components) values($1,$2,$3,'active',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) on conflict(license_id,installation_id) do update set last_seen_at=now(),product_version=coalesce(excluded.product_version,activations.product_version),metadata=coalesce(activations.metadata,'{}'::jsonb)||excluded.metadata,last_ip=coalesce(excluded.last_ip,activations.last_ip),last_user_agent=coalesce(excluded.last_user_agent,activations.last_user_agent),last_hostname=coalesce(excluded.last_hostname,activations.last_hostname),last_platform=coalesce(excluded.last_platform,activations.last_platform),last_architecture=coalesce(excluded.last_architecture,activations.last_architecture),last_client=coalesce(excluded.last_client,activations.last_client),last_client_version=coalesce(excluded.last_client_version,activations.last_client_version),last_provider=coalesce(excluded.last_provider,activations.last_provider),last_region=coalesce(excluded.last_region,activations.last_region),current_components=case when excluded.current_components<>'{}'::jsonb then excluded.current_components else activations.current_components end`,[license.id,input.installationId,input.productVersion??null,JSON.stringify(input.metadata??{}),input.requestIp??null,input.userAgent??null,t.hostname?t.hostname:null,t.platform?t.platform:null,t.architecture?t.architecture:null,t.client?t.client:null,t.clientVersion?t.clientVersion:null,t.provider?t.provider:null,t.region?t.region:null,t.components&&typeof t.components==='object'?JSON.stringify(t.components):'{}']);
    }
  }
  const valid=validLicense&&installationValid;
  const code=valid?'LICENSE_VALID':!installationValid?'INSTALLATION_LOCKED_OR_TERMINATED':expired?'LICENSE_EXPIRED':license.product_status!=='active'?'PRODUCT_DISABLED':`LICENSE_${String(license.status).toUpperCase()}`;
  return{valid,code,status:valid?200:403,expires_at:license.expires_at??null,metadata:license.metadata??{},license_id:license.id};
}

export async function setLicenseStatus(id:string,status:LicenseStatus,actorUserId?:string|null,actor?:string){const result=await db().query(`update licenses set status=$1 where id=$2 returning id,status`,[status,id]);if(!result.rowCount)throw new Error('License not found');await db().query(`insert into audit_events(actor_user_id,actor,action,resource_type,resource_id,details) values($1,$2,'license.status','license',$3,$4)`,[actorUserId??null,actor??'system',id,JSON.stringify({status})]);return result.rows[0];}

export async function setInstallationStatus(id:string,status:InstallationStatus,actorUserId?:string|null,actor?:string){const result=await db().query(`update activations set status=$1 where id=$2 returning id,license_id,installation_id,status,last_seen_at`,[status,id]);if(!result.rowCount)throw new Error('Installation not found');await db().query(`insert into audit_events(actor_user_id,actor,action,resource_type,resource_id,details) values($1,$2,'installation.status','activation',$3,$4)`,[actorUserId??null,actor??'system',id,JSON.stringify({status})]);return result.rows[0];}

export async function rotateLicense(id:string,actorUserId?:string|null,actor?:string){
  const pool=db();
  const current=(await pool.query(`select l.id,l.status,l.expires_at,l.customer_external_id,l.customer_override,l.metadata,p.id product_id from licenses l join products p on p.id=l.product_id where l.id=$1 limit 1`,[id])).rows[0];
  if(!current)throw new Error('License not found');

  // Rotation is a credential replacement, not a new license. Reuse the same
  // database row whenever the license is not terminally revoked. This keeps
  // one customer license record while replacing only its secret.
  if(current.status!=='revoked'){
    const key=generateLicenseKey();
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
      [actorUserId??null,actor??'system',id,JSON.stringify({reused_license_id:id,previous_last4:null,rotated_in_place:true})],
    );
    return {...replacement,key,alreadyIssued:false};
  }

  // A revoked/terminated license is terminal. A fresh row is required so the
  // old record remains an auditable historical record.
  const replacement=await issueLicense({
    productId:current.product_id,
    customerExternalId:current.customer_external_id,
    customerOverride:current.customer_override,
    externalReference:`rotation:${id}:${Date.now()}`,
    expiresAt:current.expires_at?new Date(current.expires_at):null,
    metadata:{...(current.metadata||{}),rotated_from:id},
    actorUserId,
    actor
  });
  await pool.query('update activations set license_id=$1 where license_id=$2 and status<>$3',[replacement.id,id,'terminated']);
  await pool.query(
    `insert into audit_events(actor_user_id,actor,action,resource_type,resource_id,details)
     values($1,$2,'license.rotate','license',$3,$4)`,
    [actorUserId??null,actor??'system',replacement.id,JSON.stringify({previous_license_id:id,migrated_installations:true,created_replacement:true})],
  );
  return replacement;
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
    activation=(await pool.query(`insert into activations(license_id,installation_id,product_version,status,metadata,last_ip,last_user_agent,last_client,last_client_version,last_provider,last_region,current_components) values($1,$2,$3,'active',$4,$5,$6,$7,$8,$9,$10,$11) returning id,status`,[
      input.licenseId,input.installationId,input.productVersion??null,JSON.stringify(input.details??{}),input.sourceIp??null,input.userAgent??null,input.client??null,input.clientVersion??null,input.provider??null,input.region??null,JSON.stringify((input.details&&typeof input.details==='object'&&input.details.components&&typeof input.details.components==='object')?input.details.components:{})
    ])).rows[0];
  }
  if(!activation) throw Object.assign(new Error('Installation is not registered for this license'),{code:'INSTALLATION_NOT_REGISTERED',status:403});
  if(activation.status!=='active') throw Object.assign(new Error('Installation is locked or terminated'),{code:'INSTALLATION_LOCKED_OR_TERMINATED',status:403});
  const details=input.details&&typeof input.details==='object'?input.details:{};
  const components=(details.components&&typeof details.components==='object')?details.components:{};
  await pool.query('insert into deployment_events(license_id,activation_id,installation_id,release_id,action,phase,product,product_version,previous_version,deployment_id,deployment_url,project_id,project_name,provider,region,platform,architecture,hostname,client,client_version,source_ip,user_agent,customer_identity,details) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24)',[
    input.licenseId,activation.id,input.installationId,input.releaseId??null,input.action,input.phase,input.product,input.productVersion??null,input.previousVersion??null,input.deploymentId??null,input.deploymentUrl??null,input.projectId??null,input.projectName??null,input.provider??null,input.region??null,input.platform??null,input.architecture??null,input.hostname??null,input.client??null,input.clientVersion??null,input.sourceIp??null,input.userAgent??null,JSON.stringify(input.customerIdentity??{}),JSON.stringify(details)
  ]);
  await pool.query(`update activations set last_seen_at=now(),last_ip=coalesce($3,last_ip),last_user_agent=coalesce($4,last_user_agent),last_hostname=coalesce($5,last_hostname),last_platform=coalesce($6,last_platform),last_architecture=coalesce($7,last_architecture),last_client=coalesce($8,last_client),last_client_version=coalesce($9,last_client_version),last_provider=coalesce($10,last_provider),last_region=coalesce($11,last_region),last_deployment_id=coalesce($12,last_deployment_id),last_deployment_url=coalesce($13,last_deployment_url),last_deployment_status=$14,last_operation=$15,product_version=coalesce($16,product_version),deployment_count=deployment_count+case when $17=true then 1 else 0 end,current_components=case when $18::jsonb<>'{}'::jsonb then $18::jsonb else current_components end where id=$1`,[activation.id,input.licenseId,input.sourceIp??null,input.userAgent??null,input.hostname??null,input.platform??null,input.architecture??null,input.client??null,input.clientVersion??null,input.provider??null,input.region??null,input.deploymentId??null,input.deploymentUrl??null,input.phase,input.action,input.productVersion??null,input.phase==='completed',JSON.stringify(components)]);
  return {ok:true,activationId:activation.id,installationId:input.installationId};
}
