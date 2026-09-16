import { redirect } from 'next/navigation';
import { db } from '../../lib/db';
import { getSessionUser } from '../../lib/session';
import LoginForm from './login-form';

export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  if (await getSessionUser()) redirect('/');
  const count = (await db().query('select count(*)::int count from users')).rows[0].count;
  if (count === 0) redirect('/setup');
  return <main className="login-shell"><div className="login-card"><div className="brand">License Manager</div><h1>Sign in</h1><p className="muted">This account belongs to the License Manager itself.</p><LoginForm /></div></main>;
}
