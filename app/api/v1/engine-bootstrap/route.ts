import {createHash} from 'node:crypto';
import {NextResponse} from 'next/server';
import {db} from '../../../../lib/db';
import {validateLicense} from '../../../../lib/core/licenses';

// Engine first-install source delivery. This is deliberately independent of
// published releases and never exposes the private GitHub credential.
export const runtime='nodejs';
export const dynamic='force-dynamic';
const REPO='lucaskerim123/V1-vercel-engine';
const REF='UPDATE_RELEASE';
const MAX_ARCHIVE_BYTES=75*1024*1024;

function deny(code:string,status:number){return NextResponse.json({ok:false,code},{status,headers:{'cache-control':'no-store'}});}
function requestIp(request:Request){return request.headers.get('x-real-ip')?.trim()||request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()||null;}

export async function GET(request:Request){
  try{
    const licenseKey=String(request.headers.get('x-license-key')||'').trim();
    const installationId=String(request.headers.get('x-installation-id')||'').trim();
    if(!licenseKey||!installationId)return deny('ENGINE_BOOTSTRAP_CREDENTIALS_REQUIRED',401);

    const settings=(await db().query(
      'select system_enabled,licensing_enabled,maintenance_mode,deployment_enabled,update_deployment_enabled from system_settings where id=true'
    )).rows[0];
    if(!settings?.system_enabled||!settings?.licensing_enabled||settings?.maintenance_mode)return deny('AUTHORITY_UNAVAILABLE',503);
    if(!settings?.deployment_enabled||settings?.update_deployment_enabled===false)return deny('ENGINE_DEPLOYMENT_DISABLED',403);

    // Do not let downloading source itself register, reactivate or move a licence.
    const existing=(await db().query(
      `select a.id from activations a join licenses l on l.id=a.license_id join products p on p.id=l.product_id
       where a.installation_id=$1 and a.status='active' and l.status='active'
         and (l.expires_at is null or l.expires_at>now()) and p.slug='orbitfs_base' limit 1`,
      [installationId]
    )).rows[0];
    if(!existing)return deny('ENGINE_BOOTSTRAP_ACTIVE_INSTALLATION_REQUIRED',403);

    const validation=await validateLicense({
      key:licenseKey,productSlug:'orbitfs_base',componentSlug:'orbitfs_base',
      installationId,requestIp:requestIp(request),userAgent:request.headers.get('user-agent'),
      telemetry:{client:'orbitfs-base-engine-bootstrap'},action:'validate'
    });
    if(!validation.valid||validation.installation?.locked!==true)
      return deny(String(validation.code||'ENGINE_BOOTSTRAP_LICENSE_DENIED'),Number(validation.status||403));

    // The host is a shared code baseline, not an entitlement grant.
    // Per-component entitlement is enforced independently at activation/runtime.

    const token=String(process.env.ORBITFS_ENGINE_BOOTSTRAP_GITHUB_TOKEN||process.env.ORBITFS_RELEASE_DISPATCH_TOKEN||process.env.GITHUB_RELEASE_TOKEN||'').trim();
    if(!token)return deny('ENGINE_BOOTSTRAP_SOURCE_NOT_CONFIGURED',503);
    const headers={authorization:'Bearer '+token,accept:'application/vnd.github+json',
      'x-github-api-version':'2022-11-28','user-agent':'OrbitFS-License-Manager'};
    const ref=await fetch(`https://api.github.com/repos/${REPO}/git/ref/heads/${REF}`,{headers,cache:'no-store',signal:AbortSignal.timeout(20000)});
    if(!ref.ok)return deny('ENGINE_BOOTSTRAP_SOURCE_REF_UNAVAILABLE',503);
    const refBody:any=await ref.json();
    const sha=String(refBody?.object?.sha||'').trim().toLowerCase();
    if(!/^[a-f0-9]{40}$/.test(sha))return deny('ENGINE_BOOTSTRAP_SOURCE_INVALID',502);
    const zip=await fetch(`https://api.github.com/repos/${REPO}/zipball/${sha}`,{
      headers,cache:'no-store',redirect:'follow',signal:AbortSignal.timeout(90000)
    });
    if(!zip.ok)return deny('ENGINE_BOOTSTRAP_SOURCE_UNAVAILABLE',503);
    const declared=Number(zip.headers.get('content-length')||0);
    if(declared>MAX_ARCHIVE_BYTES)return deny('ENGINE_BOOTSTRAP_SOURCE_TOO_LARGE',502);
    const bytes=Buffer.from(await zip.arrayBuffer());
    if(bytes.length<1||bytes.length>MAX_ARCHIVE_BYTES)return deny('ENGINE_BOOTSTRAP_SOURCE_TOO_LARGE',502);
    const checksum=createHash('sha256').update(bytes).digest('hex');
    await db().query(
      `insert into audit_events(actor_user_id,actor,action,resource_type,resource_id,details)
       values(null,'engine-bootstrap','engine.bootstrap.source','installation',$1,$2)`,
      [installationId,JSON.stringify({sourceRepo:REPO,sourceRef:REF,sourceCommit:sha,sha256:checksum,bytes:bytes.length,licenseId:validation.license_id})]
    );
    return new Response(new Uint8Array(bytes),{status:200,headers:{
      'content-type':'application/zip','cache-control':'private, no-store',
      'x-orbitfs-source-repo':REPO,'x-orbitfs-source-ref':REF,
      'x-orbitfs-source-commit':sha,'x-orbitfs-archive-sha256':checksum,
      'x-content-type-options':'nosniff'
    }});
  }catch(error:any){
    console.error('engine bootstrap delivery failed',String(error?.message||error));
    return deny('ENGINE_BOOTSTRAP_DELIVERY_FAILED',503);
  }
}
