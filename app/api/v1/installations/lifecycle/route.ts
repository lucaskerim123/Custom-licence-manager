import {NextResponse} from 'next/server';
import {integrationAuthorized} from '../../../../../lib/auth';
import {db} from '../../../../../lib/db';
import {setInstallationStatus} from '../../../../../lib/core/licenses';

const ACTIONS=new Set(['undeploy','uninstall','base_reinstall']);
const PHASES=new Set(['plan','authorize','waiting_license','completed','failed']);

export async function POST(request:Request){
  const actor=await integrationAuthorized(request,'deployment.write');
  if(!actor)return NextResponse.json({ok:false,code:'UNAUTHORIZED'},{status:401});

  const body=await request.json().catch(()=>null);
  const action=String(body?.action||'').trim().toLowerCase();
  const phase=String(body?.phase||'plan').trim().toLowerCase();
  const licenseId=String(body?.licenseId||body?.license_id||'').trim();
  const installationId=String(body?.installationId||body?.installation_id||'').trim();
  const releaseLicense=body?.releaseLicense===true||body?.release_license===true;

  if(!ACTIONS.has(action))return NextResponse.json({ok:false,code:'UNSUPPORTED_LIFECYCLE_ACTION'},{status:400});
  if(!PHASES.has(phase))return NextResponse.json({ok:false,code:'INVALID_LIFECYCLE_PHASE'},{status:400});
  if(!licenseId||!installationId)return NextResponse.json({ok:false,code:'LICENSE_AND_INSTALLATION_REQUIRED'},{status:400});

  const license=(await db().query('select id,status,expires_at,license_key_last4,metadata from licenses where id=$1 limit 1',[licenseId])).rows[0];
  if(!license)return NextResponse.json({ok:false,code:'LICENSE_NOT_FOUND'},{status:404});

  const activation=(await db().query(
    'select id,status,installation_id,last_deployment_id,last_deployment_url from activations where license_id=$1 and installation_id=$2 limit 1',
    [licenseId,installationId],
  )).rows[0]||null;

  const details={
    action,phase,licenseId,installationId,releaseLicense,
    activationStatus:activation?.status||null,
    deploymentId:body?.deploymentId||body?.deployment_id||activation?.last_deployment_id||null,
    deploymentUrl:body?.deploymentUrl||body?.deployment_url||activation?.last_deployment_url||null,
    provider:body?.provider||'vercel',
    reason:body?.reason||null,
    targetReleaseId:body?.targetReleaseId||body?.target_release_id||null,
    targetVersion:body?.targetVersion||body?.target_version||null,
    channel:body?.channel||body?.release_channel||null,
    result:body?.result&&typeof body.result==='object'?body.result:null,
    error:body?.error||null,
  };

  if(phase==='authorize'&&action==='base_reinstall'&&releaseLicense){
    if(!activation)return NextResponse.json({ok:false,code:'BASE_REINSTALL_ACTIVATION_NOT_FOUND'},{status:409});
    const metadata=license.metadata&&typeof license.metadata==='object'?{...license.metadata}:{};
    metadata.base_reinstall_rotation_required={
      installationId,
      requestedAt:new Date().toISOString(),
      previousKeyLast4:license.license_key_last4||null,
      targetReleaseId:details.targetReleaseId||null,
      targetVersion:details.targetVersion||null,
      channel:details.channel||null,
    };
    await db().query('update licenses set metadata=$2 where id=$1',[licenseId,JSON.stringify(metadata)]);
    if(activation.status!=='released'){
      await setInstallationStatus(activation.id,'released',null,'orbitfs-base-reinstall');
      details.activationStatus='released';
    }
  }

  if(phase==='completed'&&action==='uninstall'&&releaseLicense&&activation&&activation.status!=='released'){
    await setInstallationStatus(activation.id,'released',null,'orbitfs-lifecycle');
    details.activationStatus='released';
  }

  await db().query(
    `insert into audit_events(actor,action,resource_type,resource_id,details)
     values($1,$2,'installation',$3,$4)`,
    [`api:${actor.name||actor.actor||'deployer'}`,`installation.lifecycle.${action}.${phase}`,activation?.id||licenseId,JSON.stringify(details)],
  );

  return NextResponse.json({
    ok:true,
    authority:'orbitfs-license-master-v2',
    action,
    phase,
    authorized:phase==='authorize'||phase==='plan',
    activation:activation?{id:activation.id,status:details.activationStatus,installationId:activation.installation_id}:null,
    releaseLicense,
  });
}
