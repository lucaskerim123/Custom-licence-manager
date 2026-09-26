import {createHash} from 'node:crypto';
import {NextResponse} from 'next/server';
import {integrationAuthorized} from '../../../../../../lib/auth';
import {db} from '../../../../../../lib/db';
export const runtime='nodejs';

function githubAssetUrl(value:string){
  try{
    const u=new URL(value);
    if(u.hostname!=='api.github.com')return null;
    const m=u.pathname.match(/^\/repos\/([^/]+)\/([^/]+)\/releases\/assets\/(\d+)$/);
    return m?{owner:m[1],repo:m[2],assetId:m[3]}:null;
  }catch{return null;}
}

export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){
  const auth=await integrationAuthorized(request,'releases.read');
  if(!auth)return NextResponse.json({error:'UNAUTHORIZED',code:'UNAUTHORIZED'},{status:401});
  const {id}=await params;
  const row=(await db().query("select artifact_url,artifact_name,artifact_repo,source_repo,checksum,manifest from releases where id=$1 limit 1",[id])).rows[0];
  if(!row)return NextResponse.json({error:'RELEASE_NOT_FOUND'},{status:404});

  const token=String(process.env.ORBITFS_RELEASE_DISPATCH_TOKEN||process.env.GITHUB_RELEASE_TOKEN||process.env.GITHUB_TOKEN||'').trim();
  let assetUrl=String(row.artifact_url||'').trim();
  if(!assetUrl){
    const repo=String(row.artifact_repo||row.source_repo||'').trim();
    const tag=String(row.manifest?.artifactTag||'').trim();
    const name=String(row.artifact_name||'').trim();
    if(!repo||!tag||!name)return NextResponse.json({error:'ARTIFACT_NOT_CONFIGURED',code:'ARTIFACT_NOT_CONFIGURED'},{status:404});
    const headers:Record<string,string>={accept:'application/vnd.github+json','x-github-api-version':'2022-11-28','user-agent':'OrbitFS-License-Master'};
    if(token)headers.authorization='Bearer '+token;
    const releaseResponse=await fetch('https://api.github.com/repos/'+repo+'/releases/tags/'+encodeURIComponent(tag),{headers,cache:'no-store'});
    if(!releaseResponse.ok)return NextResponse.json({error:'ARTIFACT_DOWNLOAD_FAILED',code:'ARTIFACT_DOWNLOAD_FAILED'},{status:503});
    const release:any=await releaseResponse.json();
    const asset=Array.isArray(release.assets)?release.assets.find((item:any)=>String(item.name||'')===name):null;
    if(!asset?.url)return NextResponse.json({error:'ARTIFACT_NOT_CONFIGURED',code:'ARTIFACT_NOT_CONFIGURED'},{status:404});
    assetUrl=String(asset.url);
  }

  const github=githubAssetUrl(assetUrl);
  const response=github
    ? await fetch('https://api.github.com/repos/'+encodeURIComponent(github.owner)+'/'+encodeURIComponent(github.repo)+'/releases/assets/'+github.assetId,{
        headers:{
          accept:'application/octet-stream',
          authorization:token?'Bearer '+token:'',
          'x-github-api-version':'2026-03-10',
          'user-agent':'OrbitFS-License-Master'
        },
        cache:'no-store',
        redirect:'follow'
      })
    : await fetch(assetUrl,{headers:{accept:'application/octet-stream'},cache:'no-store',redirect:'follow'});

  if(!response.ok)return NextResponse.json({error:'ARTIFACT_DOWNLOAD_FAILED',code:'ARTIFACT_DOWNLOAD_FAILED'},{status:503});
  const bytes=Buffer.from(await response.arrayBuffer());
  const expected=String(row.checksum||'').trim().toLowerCase();
  const actual=createHash('sha256').update(bytes).digest('hex');
  if(!/^[a-f0-9]{64}$/.test(expected)||actual!==expected)return NextResponse.json({error:'ARTIFACT_CHECKSUM_MISMATCH',code:'ARTIFACT_CHECKSUM_MISMATCH'},{status:502});
  return new Response(bytes,{
    status:200,
    headers:{
      'content-type':response.headers.get('content-type')||'application/octet-stream',
      'content-disposition':response.headers.get('content-disposition')||`attachment; filename="${row.artifact_name||'orbitfs-release'}"`,
      'cache-control':'private, no-store'
    }
  });
}

export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
  return NextResponse.json({error:'ARTIFACT_UPLOAD_NOT_SUPPORTED',code:'ARTIFACT_UPLOAD_NOT_SUPPORTED',message:'Release artifacts are produced and supplied by the GitHub release workflow. Provide artifact_url, artifact_name, artifact_run_id and checksum during release intake.'},{status:409});
}
