import {NextResponse} from 'next/server';
import {integrationAuthorized} from '../../../../lib/auth';
import {db} from '../../../../lib/db';

export async function GET(request:Request){
  const auth=(await integrationAuthorized(request,'releases.read'))||(await integrationAuthorized(request,'license.issue'))||(await integrationAuthorized(request,'license.manage'));
  if(!auth)return NextResponse.json({error:'UNAUTHORIZED',code:'UNAUTHORIZED'},{status:401});
  const rows=(await db().query("select id,slug code,name,status,description,validation_policy from products where status<>'archived' order by slug")).rows;
  return NextResponse.json({authority:'orbitfs-license-master-v2',products:rows});
}
