import {NextResponse} from 'next/server';
import {requireUser} from '../../../../lib/session';

const REPOS={
  licenseManager:{repo:'lucaskerim123/Custom-licence-manager',label:'Custom License Manager',ci:'ci.yml',deploy:'production-deploy.yml'},
  billingStore:{repo:'lucaskerim123/V2_Billing_Store',label:'V2 Billing Store',ci:'ci.yml',deploy:'production-deploy.yml'},
} as const;
const roles=['owner','admin','operator'];

async function authUser(){const user=await requireUser();if(!roles.includes(user.role))throw new Error('You are not authorized to inspect repository operations.');}
async function github(path:string){const token=String(process.env.GITHUB_ACTIONS_TOKEN||'').trim();if(!token)throw new Error('GITHUB_ACTIONS_TOKEN is not configured on License Manager.');const r=await fetch('https://api.github.com'+path,{headers:{accept:'application/vnd.github+json',authorization:'Bearer '+token,'x-github-api-version':'2022-11-28'},cache:'no-store'});const body=await r.text();let data:any=null;try{data=body?JSON.parse(body):null}catch{}if(!r.ok)throw new Error(data?.message||('GitHub API returned HTTP '+r.status+'.'));return data;}

function runSummary(run:any){return run?{id:run.id,status:run.status,conclusion:run.conclusion,run_number:run.run_number,head_sha:run.head_sha,created_at:run.created_at,updated_at:run.updated_at,html_url:run.html_url,name:run.name}:null;}
function commitSummary(c:any){return{sha:c.sha,html_url:c.html_url,message:String(c.commit?.message||'').split('\n')[0],author:c.commit?.author?.name||c.author?.login||'Unknown',date:c.commit?.author?.date||c.commit?.committer?.date||null};}

async function scan(key:keyof typeof REPOS){
 const cfg=REPOS[key];
 const ref=await github('/repos/'+cfg.repo+'/git/ref/heads/main');
 const currentSha=ref.object?.sha;
 if(!currentSha)throw new Error('Unable to resolve main branch for '+cfg.repo+'.');
 const [ciAny,ciSuccess,deployAny,headCommit]=await Promise.all([
  github('/repos/'+cfg.repo+'/actions/workflows/'+cfg.ci+'/runs?branch=main&per_page=1'),
  github('/repos/'+cfg.repo+'/actions/workflows/'+cfg.ci+'/runs?branch=main&status=success&per_page=1'),
  github('/repos/'+cfg.repo+'/actions/workflows/'+cfg.deploy+'/runs?branch=main&per_page=1'),
  github('/repos/'+cfg.repo+'/commits/'+currentSha)
 ]);
 const latestCi=ciAny.workflow_runs?.[0]||null;
 const lastSuccessfulCi=ciSuccess.workflow_runs?.[0]||null;
 const latestDeploy=deployAny.workflow_runs?.[0]||null;
 const baselineSha=lastSuccessfulCi?.head_sha||latestDeploy?.head_sha||null;
 const commits=baselineSha&&baselineSha!==currentSha?(await github('/repos/'+cfg.repo+'/compare/'+baselineSha+'...'+currentSha+'?per_page=100')).commits||[]:[];
 let changedFiles:any[]=[];let completeFileScan=true;
 if(baselineSha&&baselineSha!==currentSha){
   const [baseCommit,currentCommit]=await Promise.all([
     github('/repos/'+cfg.repo+'/commits/'+baselineSha),
     github('/repos/'+cfg.repo+'/commits/'+currentSha)
   ]);
   const baseTreeSha=baseCommit.commit?.tree?.sha,currentTreeSha=currentCommit.commit?.tree?.sha;
   if(!baseTreeSha||!currentTreeSha)throw new Error('Unable to resolve repository trees for '+cfg.repo+'.');
   const [baseTree,currentTree]=await Promise.all([
     github('/repos/'+cfg.repo+'/git/trees/'+baseTreeSha+'?recursive=1'),
     github('/repos/'+cfg.repo+'/git/trees/'+currentTreeSha+'?recursive=1')
   ]);
   if(baseTree.truncated||currentTree.truncated)completeFileScan=false;
   const baseMap=new Map((baseTree.tree||[]).filter((x:any)=>x.type==='blob').map((x:any)=>[x.path,x]));
   const currentMap=new Map((currentTree.tree||[]).filter((x:any)=>x.type==='blob').map((x:any)=>[x.path,x]));
   const paths=new Set([...baseMap.keys(),...currentMap.keys()]);
   for(const path of paths){
     const before:any=baseMap.get(path),after:any=currentMap.get(path);
     if(!before)changedFiles.push({path,status:'added',sha:after.sha,size:after.size??null});
     else if(!after)changedFiles.push({path,status:'deleted',sha:null,size:null});
     else if(before.sha!==after.sha||before.mode!==after.mode)changedFiles.push({path,status:'modified',sha:after.sha,size:after.size??null});
   }
   changedFiles.sort((a,b)=>a.path.localeCompare(b.path));
 }
 const updateAvailable=currentSha!==baselineSha;
 return {
   key,label:cfg.label,repo:cfg.repo,branch:'main',currentSha,baselineSha,updateAvailable,
   latestCi:runSummary(latestCi),lastSuccessfulCi:runSummary(lastSuccessfulCi),latestDeploy:runSummary(latestDeploy),
   commits:commits.map(commitSummary).reverse(),commitCount:commits.length,
   changedFiles,changedFileCount:changedFiles.length,completeFileScan,
   checkedAt:new Date().toISOString(),
   githubCompareUrl:baselineSha?'https://github.com/'+cfg.repo+'/compare/'+baselineSha+'...'+currentSha:'https://github.com/'+cfg.repo+'/commits/main',
   currentCommitUrl:headCommit?.html_url||('https://github.com/'+cfg.repo+'/commit/'+currentSha)
 };
}
export async function GET(){try{await authUser();const results=await Promise.all((Object.keys(REPOS) as (keyof typeof REPOS)[]).map(scan));return NextResponse.json({checkedAt:new Date().toISOString(),systems:results});}catch(error:any){const message=error?.message||'Unable to scan repository updates.';return NextResponse.json({error:message},{status:message.includes('authorized')?403:500});}}
