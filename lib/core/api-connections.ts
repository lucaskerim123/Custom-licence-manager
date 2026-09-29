import {db} from '../db';

export type OfficialApiService='license_manager'|'license_runtime';
export type OfficialApiClient='billing_store'|'dev_panel'|'release_builder'|'v1_base'|'v1_engine';
export type OfficialApiRole='primary'|'fallback';

const definitions:Record<OfficialApiService,{path:string;clients:OfficialApiClient[]}>={
 license_manager:{path:'/api/v1',clients:['billing_store','dev_panel','release_builder']},
 license_runtime:{path:'/api/v1/license',clients:['v1_base','v1_engine','billing_store']},
};

function normalizeUrl(value:string,role:OfficialApiRole){
 const raw=String(value||'').trim().replace(/\/+$/,'');
 const u=new URL(raw);
 if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash)throw new Error('Official OrbitFS APIs must use a clean HTTPS URL.');
 const host=u.hostname.toLowerCase();
 const primaryHost=host==='incendiarynetworks.cc'||host.endsWith('.incendiarynetworks.cc');
 const fallbackHost=host==='orbitfs-fallback.stubengine.com';
 if(role==='primary'&&!primaryHost)throw new Error('Primary OrbitFS APIs must use an incendiarynetworks.cc host.');
 if(role==='fallback'&&!fallbackHost)throw new Error('The OrbitFS limp-mode fallback must use orbitfs-fallback.stubengine.com.');
 return {url:`${u.origin}${u.pathname.replace(/\/+$/,'')}`,host,path:u.pathname.replace(/\/+$/,'')};
}

export function validateOfficialApiConnection(serviceKey:string,baseUrl:string,allowedClients:string[]=[],connectionRole:OfficialApiRole='primary'){
 const service=String(serviceKey||'').trim().toLowerCase() as OfficialApiService;
 const role=String(connectionRole||'primary').trim().toLowerCase() as OfficialApiRole;
 const def=definitions[service];
 if(!def)throw new Error('Unsupported OrbitFS API service type.');
 if(!['primary','fallback'].includes(role))throw new Error('Unsupported OrbitFS API connection role.');
 const normalized=normalizeUrl(baseUrl,role);
 if(normalized.path!==def.path)throw new Error(`Official ${service.replaceAll('_',' ')} URLs must use ${def.path}.`);
 const clients=[...new Set((allowedClients||[]).map(x=>String(x).trim().toLowerCase()).filter(Boolean))] as OfficialApiClient[];
 if(!clients.length)throw new Error('At least one approved OrbitFS client is required.');
 const invalid=clients.filter(client=>!def.clients.includes(client));
 if(invalid.length)throw new Error(`Unsupported client assignment for ${service}: ${invalid.join(', ')}`);
 if(role==='fallback'&&clients.includes('release_builder'))throw new Error('Release builders may never use the limp-mode fallback.');
 return {service,role,baseUrl:normalized.url,allowedClients:clients};
}

export async function listOfficialApiConnections(input:{client?:string|null;service?:string|null;includeDisabled?:boolean}={}){
 const params:any[]=[];
 const where:string[]=[];
 if(!input.includeDisabled)where.push('enabled=true');
 if(input.service){params.push(String(input.service).toLowerCase());where.push('service_key=$'+params.length);}
 if(input.client){params.push(String(input.client).toLowerCase());where.push('$'+params.length+'=any(allowed_clients)');}
 const sql=`select id,service_key,label,base_url,allowed_clients,enabled,priority,settings,connection_role,failover_enabled,created_at,updated_at
            from official_api_connections
            ${where.length?'where '+where.join(' and '):''}
            order by service_key,connection_role,priority,updated_at desc`;
 try{return (await db().query(sql,params)).rows;}
 catch(error:any){
  if(error?.code==='42P01')return [];
  if(error?.code==='42703'){
   const legacy=`select id,service_key,label,base_url,allowed_clients,enabled,priority,settings,created_at,updated_at
                 from official_api_connections
                 ${where.length?'where '+where.join(' and '):''}
                 order by service_key,priority,updated_at desc`;
   return (await db().query(legacy,params)).rows.map((row:any)=>({...row,connection_role:'primary',failover_enabled:false}));
  }
  throw error;
 }
}

export async function getOfficialApiRegistry(input:{client?:string|null;service?:string|null}={}){
 const connections=await listOfficialApiConnections({client:input.client,service:input.service,includeDisabled:false});
 const revision=connections.reduce((latest:string|null,row:any)=>{
  const value=row?.updated_at?new Date(row.updated_at).toISOString():null;
  return !value?latest:!latest||value>latest?value:latest;
 },null);
 return {
  authority:'orbitfs-license-manager',
  registry_version:2,
  revision,
  failover_policy:{mode:'primary_then_limp',fallback_authoritative:false,mutation_policy:'deny'},
  connections
 };
}

export async function saveOfficialApiConnection(input:{
 id?:string|null;service_key:string;label:string;base_url:string;allowed_clients:string[];
 enabled:boolean;priority:number;settings?:Record<string,unknown>|null;
 connection_role?:OfficialApiRole;failover_enabled?:boolean;
},actorUserId:string|null,actor:string){
 const valid=validateOfficialApiConnection(input.service_key,input.base_url,input.allowed_clients,input.connection_role||'primary');
 const label=String(input.label||'').trim();
 if(!label)throw new Error('API connection label is required.');
 const priority=Math.min(10000,Math.max(0,Math.floor(Number(input.priority)||100)));
 const settings=input.settings&&typeof input.settings==='object'&&!Array.isArray(input.settings)?input.settings:{};
 const failoverEnabled=valid.role==='fallback'&&input.failover_enabled===true;
 let row:any;
 if(input.id){
  row=(await db().query(
   `update official_api_connections
    set service_key=$2,label=$3,base_url=$4,allowed_clients=$5,enabled=$6,priority=$7,settings=$8,connection_role=$9,failover_enabled=$10,updated_at=now()
    where id=$1 returning *`,
   [input.id,valid.service,label,valid.baseUrl,valid.allowedClients,input.enabled!==false,priority,JSON.stringify(settings),valid.role,failoverEnabled],
  )).rows[0];
  if(!row)throw new Error('API connection was not found.');
 }else{
  row=(await db().query(
   `insert into official_api_connections(service_key,label,base_url,allowed_clients,enabled,priority,settings,connection_role,failover_enabled)
    values($1,$2,$3,$4,$5,$6,$7,$8,$9)
    on conflict(service_key,base_url) do update set
      label=excluded.label,
      allowed_clients=excluded.allowed_clients,
      enabled=excluded.enabled,
      priority=excluded.priority,
      settings=excluded.settings,
      connection_role=excluded.connection_role,
      failover_enabled=excluded.failover_enabled,
      updated_at=now()
    returning *`,
   [valid.service,label,valid.baseUrl,valid.allowedClients,input.enabled!==false,priority,JSON.stringify(settings),valid.role,failoverEnabled],
  )).rows[0];
 }
 try{
  await db().query(
   `insert into audit_events(actor_user_id,actor,event_type,resource_type,resource_id,details)
    values($1,$2,'api.connection.updated','official_api_connection',$3,$4)`,
   [actorUserId,actor,row.id,JSON.stringify({service_key:row.service_key,base_url:row.base_url,connection_role:row.connection_role,failover_enabled:row.failover_enabled,enabled:row.enabled,priority:row.priority,allowed_clients:row.allowed_clients})],
  );
 }catch{}
 return row;
}
