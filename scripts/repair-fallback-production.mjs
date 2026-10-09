import sodium from 'libsodium-wrappers';
import {pathToFileURL} from 'node:url';

const AUTHORITY_URL='https://incendiarynetworks.cc/api/v1/github-profile';
const MAIN_TEAM='team_W3fS0X03YCjNkD2BoqRj6Uld';
const MAIN_LICENSE_PROJECT='prj_rxRaSrRX2xwnmJ21zfjYL31RkLsv';
const FALLBACK_TEAM='team_0fWVaLb24pyeeCRqqYu5G47K';

export const FALLBACK_SERVICES=Object.freeze([
  {repo:'remipetrovich-design/OrbitFS-Control-Centre',
   project:'prj_24FvbyWw7CAEbiug1Ec18p51z7WJ',projectName:'orbitfs-dev-panel-fallback',
   workflow:'deploy-dev-panel.yml'},
  {repo:'remipetrovich-design/OrbitFS-License-Administration',
   project:'prj_rCooJWY8JMkBjekXLO8scT35UPJ8',projectName:'orbitfs-license-fallback',
   workflow:'quick-deploy.yml'},
  {repo:'remipetrovich-design/OrbitFS-Billing-Shopfront',
   project:'prj_BZNKPOm5pTcMdD4QrOXPOqpE7Imq',projectName:'orbitfs-billing-fallback',
   workflow:'quick-redesign-deploy.yml'},
]);

const valid=(v)=>typeof v==='string' && v.trim().length>=16 &&
  !/^(?:change-me|placeholder|replace-with|your-|undefined|null)(?:$|[-_ ])/i.test(v.trim());

export function productionCredential(records,key) {
  if(!Array.isArray(records))throw new Error('Main Vercel did not return environment variable records.');
  const matching=records.filter(r=>r && r.key===key &&
    (Array.isArray(r.target)?r.target.includes('production'):r.target==='production'));
  if(matching.length!==1)throw new Error('Expected exactly one Production '+key+' in Main License Manager Vercel.');
  const value=matching[0].value;
  if(!valid(value))throw new Error('Main License Manager Production '+key+' is not readable or still a placeholder.');
  return value.trim();
}

export function assertFallbackMode(state) {
  if(state?.profile!=='fallback'||state?.mode!=='fallback')
    throw new Error('License Manager is not in FALLBACK source mode. No GitHub secrets were changed.');
}

export function assertFallbackProject(actual,service) {
  if(actual?.id!==service.project||actual?.accountId!==FALLBACK_TEAM||
    actual?.name!==service.projectName)
    throw new Error('Wrong Fallback Vercel team/project for '+service.repo+'. No GitHub secrets were changed.');
}

export function productionEnvironmentName(response,repo) {
  const names=(response?.environments||[])
    .filter(x=>typeof x?.name==='string'&&x.name.toLowerCase()==='production');
  if(names.length!==1)throw new Error('Missing or duplicate GitHub Production environment for '+repo);
  return names[0].name;
}

async function api(url,token,method='GET',body) {
  let response;
  try{
    response=await fetch(url,{
      method,cache:'no-store',signal:AbortSignal.timeout(15000),
      headers:{accept:'application/json',
        authorization:'Bearer '+token,
        ...(url.startsWith('https://api.github.com')?{'x-github-api-version':'2022-11-28'}:{}),
        ...(body?{'content-type':'application/json'}:{})},
      ...(body?{body:JSON.stringify(body)}:{})
    });
  }catch{throw new Error('Provider request failed or timed out during Fallback connection repair.');}
  if(!response.ok){
    const provider=url.startsWith('https://api.vercel.com')?'Vercel':'GitHub';
    // Never include provider response bodies: they may contain secret material.
    throw new Error(provider+' returned HTTP '+response.status+' for a required Fallback connection operation.');
  }
  if(response.status===204||response.status===205)return {};
  try{return await response.json();}catch{
    throw new Error('Provider returned unreadable JSON during Fallback connection repair.');
  }
}

function githubUrl(repo,suffix=''){
  return 'https://api.github.com/repos/'+repo.split('/').map(encodeURIComponent).join('/')+suffix;
}

export async function repairFallbackProduction() {
  const mainVercel=String(process.env.MAIN_VERCEL_API_TOKEN||'').trim();
  if(!valid(mainVercel))throw new Error('Main License Manager GitHub Production environment is missing its Main Vercel secret VERCEL_TOKEN.');
  // A maintenance run must not alter the inactive system or select the mode.
  assertFallbackMode(await api(AUTHORITY_URL,'', 'GET'));
  const environment=await api(
    'https://api.vercel.com/v10/projects/'+MAIN_LICENSE_PROJECT+
      '/env?decrypt=true&teamId='+MAIN_TEAM,mainVercel
  );
  const rows=environment.envs||environment.env||environment;
  const githubToken=productionCredential(rows,'ORBITFS_FALLBACK_GITHUB_TOKEN');
  const fallbackVercel=productionCredential(rows,'ORBITFS_FALLBACK_VERCEL_TOKEN');

  const who=await api('https://api.github.com/user',githubToken);
  if(String(who.login||'').toLowerCase()!=='remipetrovich-design')
    throw new Error('Fallback GitHub token does not belong to remipetrovich-design. No secrets changed.');

  // Preflight every project, environment and GitHub sealing key BEFORE writes.
  const prepared=[];
  for(const service of FALLBACK_SERVICES){
    const project=await api(
      'https://api.vercel.com/v9/projects/'+service.project+'?teamId='+FALLBACK_TEAM,
      fallbackVercel
    );
    assertFallbackProject(project,service);
    const env=await api(githubUrl(service.repo,'/environments?per_page=100'),githubToken);
    const envName=productionEnvironmentName(env,service.repo);
    const base=githubUrl(service.repo,'/environments/'+encodeURIComponent(envName));
    const key=await api(base+'/secrets/public-key',githubToken);
    if(typeof key.key!=='string'||typeof key.key_id!=='string'||!key.key_id)
      throw new Error('GitHub Production secret sealing key is unavailable for '+service.repo);
    prepared.push({service,base,key});
  }

  await sodium.ready;
  const results={updated:[],queued:[],failed:[]};
  for(const {service,base,key} of prepared){
    const publicKey=sodium.from_base64(key.key,sodium.base64_variants.ORIGINAL);
    if(publicKey.length!==32)throw new Error('Invalid GitHub public key for '+service.repo);
    const sealed=sodium.to_base64(
      sodium.crypto_box_seal(sodium.from_string(fallbackVercel),publicKey),
      sodium.base64_variants.ORIGINAL
    );
    await api(base+'/secrets/VERCEL_TOKEN',githubToken,'PUT',{
      encrypted_value:sealed,key_id:key.key_id
    });
    results.updated.push(service.repo);
    console.log('Updated GitHub Production VERCEL_TOKEN for '+service.repo);
  }
  // Queue the existing service deployment workflows. Their existing source
  // profile gates, release validation and build policies remain unchanged.
  // Dispatch is not a claim that the deployment is healthy or published.
  for(const {service} of prepared){
    try{
      await api(githubUrl(service.repo,
        '/actions/workflows/'+encodeURIComponent(service.workflow)+'/dispatches'
      ),githubToken,'POST',{ref:'main'});
      results.queued.push(service.repo);
      console.log('Queued existing Fallback deployment workflow for '+service.repo);
    }catch(e){
      results.failed.push(service.repo);
      console.error('Workflow dispatch failed for '+service.repo+': '+String(e.message||e));
    }
  }
  if(results.failed.length)
    throw new Error('Fallback GitHub secrets updated, but workflow dispatch partially failed for: '+results.failed.join(', '));
  console.log('Fallback GitHub Production connection repair finished. Verify each service deployment before routing.');
  return results;
}

if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href){
  repairFallbackProduction().catch(error=>{
    console.error('Fallback connection repair failed: '+(error instanceof Error?error.message:'Unexpected error'));
    process.exitCode=1;
  });
}
