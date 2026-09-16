import {NextResponse} from 'next/server';
import {integrationAuthorized} from '../../../../lib/auth';
import {db} from '../../../../lib/db';

export async function GET(request:Request){
  if(!(await integrationAuthorized(request,'releases.read')))return NextResponse.json({error:'UNAUTHORIZED'},{status:401});
  const rows=(await db().query("select id,slug code,name,status,description from products where status<>'archived' order by slug")).rows;
  return NextResponse.json({products:rows});
}
