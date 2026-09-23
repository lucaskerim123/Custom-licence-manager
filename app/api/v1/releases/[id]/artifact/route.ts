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
  const row=(await db().query("select artifact_url,artifact_name from releases where id=$1 limit 1",[id])).rows[0];
  if(!row)return NextResponse.json({error:'RELEASE_NOT_FOUND'},{status:404});
  if(!row.artifact_url)return NextResponse.json({error:'ARTIFACT_NOT_CONFIGURED',code:'ARTIFACT_NOT_CONFIGURED'},{status:404});

  const github=githubAssetUrl(String(row.artifact_url));
  const response=github
    ? await fetch('https://api.github.com/repos/'+encodeURIComponent(github.owner)+'/'+encodeURIComponent(github.repo)+'/releases/assets/'+github.assetId,{
        headers:{
          accept:'application/octet-stream',
          authorization:'Bearer '+String(process.env.GITHUB_RELEASE_TOKEN||'').trim(),
          'x-github-api-version':'2026-03-10',
          'user-agent':'OrbitFS-License-Master'
        },
        cache:'no-store',
        redirect:'follow'
      })
    : await fetch(String(row.artifact_url),{headers:{accept:'application/octet-stream'},cache:'no-store',redirect:'follow'});

  if(!response.ok)return NextResponse.json({error:'ARTIFACT_DOWNLOAD_FAILED',code:'ARTIFACT_DOWNLOAD_FAILED'},{status:503});
  return new Response(await response.arrayBuffer(),{
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
