import {NextResponse} from 'next/server';
import {getGithubProfile} from '../../../../lib/core/settings';
import {configuredVercelFamily} from '../../../../lib/core/source-vercel';

export const dynamic='force-dynamic';

// This API is the one public routing authority. It never changes the selected
// profile, deploys a service, or exposes account credentials.
const FALLBACK_DESTINATIONS={
  panel:{projectId:'prj_24FvbyWw7CAEbiug1Ec18p51z7WJ',url:'https://orbitfs-dev-panel-fallback.vercel.app'},
  billing:{projectId:'prj_BZNKPOm5pTcMdD4QrOXPOqpE7Imq',url:'https://orbitfs-billing-fallback.vercel.app'},
} as const;

type Readiness={panel:boolean;billing:boolean};
let healthCache:{until:number;promise:Promise<Readiness>}|undefined;

async function isReady(projectId:string,token:string,teamId:string):Promise<boolean>{
  if(!token||/^(change-me|replace-with|placeholder|your-)/i.test(token))return false;
  try{
    const url=new URL('https://api.vercel.com/v6/deployments');
    url.searchParams.set('projectId',projectId);
    url.searchParams.set('teamId',teamId);
    url.searchParams.set('target','production');
    url.searchParams.set('state','READY');
    url.searchParams.set('limit','1');
    const response=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(4000),
      headers:{authorization:'Bearer '+token,accept:'application/json'}});
    if(!response.ok)return false;
    const result=await response.json() as {deployments?:Array<{readyState?:string;state?:string;target?:string}>};
    return Array.isArray(result.deployments)&&result.deployments.some(d=>
      (d.readyState==='READY'||d.state==='READY')&&(d.target===undefined||d.target==='production')
    );
  }catch{return false;}
}

function fallbackReadiness(){
  if(healthCache&&healthCache.until>Date.now())return healthCache.promise;
  const family=configuredVercelFamily('fallback');
  const token=String(process.env[family.tokenEnv]||'').trim();
  const promise=Promise.all([
    isReady(FALLBACK_DESTINATIONS.panel.projectId,token,family.teamId),
    isReady(FALLBACK_DESTINATIONS.billing.projectId,token,family.teamId),
  ]).then(([panel,billing])=>({panel,billing}));
  // Cache only readiness, not authoritative profile. Each request reads the
  // License Manager DB so changing MAIN/FALLBACK is effective immediately.
  healthCache={until:Date.now()+12000,promise};
  return promise;
}

export async function GET(){
 try{
  const profile=await getGithubProfile();
  const ready=profile==='fallback'?await fallbackReadiness():{panel:true,billing:true};
  return NextResponse.json({
    profile,
    mode:profile==='fallback'?'fallback':'main',
    ready,
    targets:{
      panel:FALLBACK_DESTINATIONS.panel.url,
      billing:FALLBACK_DESTINATIONS.billing.url,
    },
    routingComplete:profile==='primary'||(ready.panel&&ready.billing),
    authority:'License Manager',
  },{headers:{'cache-control':'no-store, no-cache, must-revalidate'}});
 }catch{
  // An unreachable authority must never make a browser follow a guessed
  // destination. Clients should preserve the existing accessible page.
  return NextResponse.json({error:'Source routing temporarily unavailable'},{
    status:503,headers:{'cache-control':'no-store'}
  });
 }
}
