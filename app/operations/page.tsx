import {requireUser} from '../../lib/session';
import SideNav from '../components/SideNav';
import RunPage from './run/page';

export const dynamic='force-dynamic';

export default async function OperationsPage(){
  await requireUser();
  return <div className="shell"><SideNav active="operations"/><main className="main"><RunPage/></main></div>;
}
