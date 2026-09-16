import { NextResponse } from 'next/server';
import { db } from '../../../../../lib/db';
export const dynamic='force-dynamic';
export async function GET(){
  try{
    const result=await db().query('select system_name,system_enabled,licensing_enabled,maintenance_mode from system_settings where id=true');
    const s=result.rows[0];
    return NextResponse.json({ok:true,service:'license-manager',system_name:s?.system_name??'License Manager',external_authority_online:Boolean(s?.system_enabled),licensing_enabled:Boolean(s?.licensing_enabled),maintenance_mode:Boolean(s?.maintenance_mode)});
  }catch(error){
    console.error('legacy health check failed',error);
    return NextResponse.json({ok:false,service:'license-manager',code:'DATABASE_UNAVAILABLE'},{status:503});
  }
}
