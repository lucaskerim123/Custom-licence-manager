import { NextResponse } from 'next/server';
import { integrationAuthorized } from '../../../../lib/auth';
import { listReleaseChannels, requireReleaseChannel } from '../../../../lib/core/release-channels';
export const runtime='nodejs';
export async function GET(request:Request){
  if(!(await integrationAuthorized(request,'releases.read')))return NextResponse.json({error:'UNAUTHORIZED'},{status:401});
  const includeDisabled=new URL(request.url).searchParams.get('include_disabled')==='true';
  return NextResponse.json({channels:await listReleaseChannels(includeDisabled)},{headers:{'cache-control':'no-store'}});
}
export async function HEAD(request:Request){
  if(!(await integrationAuthorized(request,'releases.read')))return new NextResponse(null,{status:401});
  const channel=new URL(request.url).searchParams.get('channel');
  if(!channel)return new NextResponse(null,{status:400});
  try{await requireReleaseChannel(channel);return new NextResponse(null,{status:204});}
  catch{return new NextResponse(null,{status:404});}
}
