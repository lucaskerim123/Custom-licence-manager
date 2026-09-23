import { NextRequest, NextResponse } from 'next/server';
import { adminAuthorized } from '../../../../lib/auth';
import {getSettings,setSetting,updateRuntimePolicy} from '../../../../lib/core/settings';

export async function GET(request: NextRequest) {
  if (!adminAuthorized(request)) return NextResponse.json({ error:'Unauthorized' }, { status:401 });
  return NextResponse.json(await getSettings(),{headers:{'cache-control':'no-store'}});
}

export async function PATCH(request: NextRequest) {
  if (!adminAuthorized(request)) return NextResponse.json({ error:'Unauthorized' }, { status:401 });
  const body=await request.json().catch(()=>({}));
  const actor='admin-api';
  for(const field of ['system_enabled','licensing_enabled','maintenance_mode','release_system_enabled','deployment_enabled'] as const){
    if(typeof body[field]==='boolean')await setSetting(field,body[field],String(body.actor_user_id||''),actor);
  }
  if(['validation_ttl_seconds','offline_grace_seconds','pulse_poll_seconds','max_failed_validations','allow_offline_grace'].some(k=>body[k]!==undefined)){
    await updateRuntimePolicy(body,String(body.actor_user_id||''),actor);
  }
  return NextResponse.json(await getSettings(),{headers:{'cache-control':'no-store'}});
}
