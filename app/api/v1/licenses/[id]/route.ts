import { NextResponse } from 'next/server';
import { integrationAuthorized } from '../../../../../lib/auth';
import { setLicenseStatus, LicenseStatus } from '../../../../../lib/core/licenses';

export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}){if(!integrationAuthorized(request))return NextResponse.json({error:'UNAUTHORIZED'},{status:401});const {id}=await params;const body=await request.json().catch(()=>null);const status=String(body?.status||'') as LicenseStatus;if(!['active','suspended','revoked','expired'].includes(status))return NextResponse.json({error:'INVALID_STATUS'},{status:400});try{return NextResponse.json(await setLicenseStatus(id,status,null,'integration-api'));}catch{return NextResponse.json({error:'LICENSE_NOT_FOUND'},{status:404});}}
