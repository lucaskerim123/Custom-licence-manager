import {NextResponse} from 'next/server';
import {requireUser} from '../../../../lib/session';

const REPOS={
  licenseManager:{repo:'lucaskerim123/Custom-licence-manager'},
  billingStore:{repo:'lucaskerim123/V2_Billing_Store'},
} as const;

const roles=['owner','admin','operator'];

async function github(path:string){
  const token=String(process.env.GITHUB_ACTIONS_TOKEN||'').trim();
  if(!token) throw new Error('GITHUB_ACTIONS_TOKEN is not configured on License Manager.');
  const r=await fetch('https://api.github.com'+path,{
    headers:{
      accept:'application/vnd.github+json',
      authorization:'Bearer '+token,
      'x-github-api-version':'2022-11-28',
    },
    cache:'no-store',
  });
  const body=await r.text();
  let data:any=null;
  try{data=body?JSON.parse(body):null}catch{}
  if(!r.ok) throw new Error(data?.message||('GitHub API returned HTTP '+r.status+'.'));
  return data;
}

function cleanRun(run:any){
  return run?{
    id:run.id,
    status:run.status,
    conclusion:run.conclusion,
    run_number:run.run_number,
    head_sha:run.head_sha,
    created_at:run.created_at,
    updated_at:run.updated_at,
    html_url:run.html_url,
    name:run.name,
  }:null;
}

async function githubText(path:string){
  const token=String(process.env.GITHUB_ACTIONS_TOKEN||'').trim();
  if(!token) throw new Error('GITHUB_ACTIONS_TOKEN is not configured on License Manager.');
  const r=await fetch('https://api.github.com'+path,{
    headers:{
      accept:'application/vnd.github+json',
      authorization:'Bearer '+token,
      'x-github-api-version':'2022-11-28',
    },
    cache:'no-store',
    redirect:'follow',
  });
  const body=await r.text();
  if(!r.ok) throw new Error('GitHub API returned HTTP '+r.status+'.');
  return body;
}

function cleanLogLine(line:string){
  return line
    .replace(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z\s*/,'')
    .replace(/^.*?##\[error\]\s*/,'')
    .trim();
}

function extractFailures(log:string){
  const lines=String(log||'').split(/\r?\n/).map(x=>x.trimEnd()).filter(Boolean);
  const matches:number[]=[];
  const pattern=/##\[error\]|(?:npm ERR!|pnpm ERR!|yarn error|Error:|error TS\d+|Type error|Build failed|failed with|Process completed with exit code|ELIFECYCLE|Expected .+ got|SyntaxError|ReferenceError|Module not found|Cannot find module|ENOENT|EADDRINUSE|ERR_[A-Z_]+|fatal:|FATAL|ERROR)/i;

  for(let i=0;i<lines.length;i++){
    if(pattern.test(lines[i])) matches.push(i);
  }

  if(!matches.length) return null;

  const selected:string[]=[];
  const seen=new Set<string>();
  for(const index of matches){
    for(const line of lines.slice(Math.max(0,index-8),Math.min(lines.length,index+4))){
      const clean=cleanLogLine(line);
      if(clean&&!seen.has(clean)){
        seen.add(clean);
        selected.push(clean);
      }
    }
  }

  return{
    error:selected[selected.length-1]||'Workflow job failed.',
    preceding:[],
    lines:selected.slice(-120),
  };
}

function fallbackFailure(job:any, logTail:string){
  if(job.conclusion!=='failure') return null;
  const failedSteps=(job.steps||[]).filter((step:any)=>step.conclusion==='failure');
  const lines:string[]=[];
  for(const step of failedSteps){
    lines.push('Failed step: '+step.name);
  }
  const tail=String(logTail||'').split(/\r?\n/).map(cleanLogLine).filter(Boolean).slice(-80);
  lines.push(...tail);
  const unique=[...new Set(lines)].slice(-120);
  if(!unique.length) unique.push('GitHub reported this job as failed, but no console log text was available yet.');
  return{
    error:unique[unique.length-1],
    preceding:[],
    lines:unique,
  };
}

export async function GET(request:Request){
  try{
    const user=await requireUser();
    if(!roles.includes(user.role)) throw new Error('You are not authorized to inspect workflow runs.');

    const u=new URL(request.url);
    const system=u.searchParams.get('system') as keyof typeof REPOS;
    const requestedRunId=u.searchParams.get('runId');
    if(!REPOS[system]) return NextResponse.json({error:'A valid system is required.'},{status:400});

    const repo=REPOS[system].repo;
    let runId=requestedRunId?Number(requestedRunId):NaN;
    if(requestedRunId&&!Number.isFinite(runId)) return NextResponse.json({error:'Invalid workflow run.'},{status:400});

    let run:any;
    let latestDeployment:any=null;
    let ciRun:any=null;
    let deployRun:any=null;

    if(Number.isFinite(runId)){
      run=await github('/repos/'+repo+'/actions/runs/'+runId);
    }else{
      const [latest,deployments]=await Promise.all([
        github('/repos/'+repo+'/actions/workflows/ci.yml/runs?branch=main&per_page=1'),
        github('/repos/'+repo+'/actions/workflows/production-deploy.yml/runs?branch=main&per_page=1'),
      ]);
      ciRun=latest.workflow_runs?.[0]||null;
      deployRun=deployments.workflow_runs?.[0]||null;
      latestDeployment=cleanRun(deployRun);
      run=[ciRun,deployRun].filter(Boolean).find((x:any)=>x.status!=='completed')||ciRun||deployRun;
      if(!run) return NextResponse.json({error:'No workflow runs found.'},{status:404});
      runId=run.id;
    }

    const jr=await github('/repos/'+repo+'/actions/runs/'+runId+'/jobs?per_page=100');
    const jobs=await Promise.all((jr.jobs||[]).map(async(job:any)=>{
      let failure:any=null;
      let logTail='';
      let logError='';

      try{
        const logs=await githubText('/repos/'+repo+'/actions/jobs/'+job.id+'/logs');
        const lines=logs.split(/\r?\n/).filter(Boolean);
        logTail=lines.slice(-250).join('\n');
        failure=extractFailures(logs);
      }catch(error:any){
        logError=error?.message||'Unable to retrieve GitHub job logs.';
      }

      if(!failure) failure=fallbackFailure(job,logTail);

      return{
        id:job.id,
        name:job.name,
        status:job.status,
        conclusion:job.conclusion,
        started_at:job.started_at,
        completed_at:job.completed_at,
        html_url:job.html_url,
        steps:(job.steps||[]).map((s:any)=>({
          name:s.name,
          status:s.status,
          conclusion:s.conclusion,
          started_at:s.started_at,
          completed_at:s.completed_at,
        })),
        failure,
        logTail,
        logError,
      };
    }));

    const failedJob=jobs.find((j:any)=>j.conclusion==='failure'||j.failure);
    const failure=failedJob?.failure||null;
    const errorLogUrl=failure
      ?u.origin+'/api/operations/run/error?system='+encodeURIComponent(system)+'&runId='+runId
      :null;

    const chatPrompt=failure
      ?[
        'Fix this failed GitHub Actions job.',
        '',
        'Repository: https://github.com/'+repo,
        'Branch: main',
        'Commit: '+run.head_sha,
        'Workflow: '+(run.name||'Unknown'),
        'Run: '+(failedJob?.html_url||run.html_url),
        'Failed job: '+(failedJob?.name||'Unknown'),
        errorLogUrl?'License Manager error endpoint: '+errorLogUrl:'',
        '',
        'Captured error/output:',
        ...failure.lines,
        '',
        'Trace the root cause in the repository, fix the implementation rather than masking the failure, and run the relevant validation/build checks. Do not deploy automatically.',
      ].filter(Boolean).join('\n')
      :null;

    return NextResponse.json({
      run:cleanRun(run),
      ciRun:cleanRun(ciRun),
      deployRun:cleanRun(deployRun),
      monitoring:run.name||'Workflow',
      latestDeployment,
      jobs,
      failure,
      errorLogUrl,
      chatPrompt,
    });
  }catch(error:any){
    const message=error?.message||'Unable to load workflow run.';
    return NextResponse.json({error:message},{status:message.includes('authorized')?403:500});
  }
}
