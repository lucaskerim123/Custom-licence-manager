import { redirect } from 'next/navigation';
import { getSessionUser } from '../../lib/session';
import LoginForm from './login-form';

export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  if (await getSessionUser()) redirect('/');
  return <main className="login-shell"><div className="login-card"><div className="brand">License Manager</div><h1>Sign in</h1><p className="muted">This account belongs to the License Manager itself.</p><LoginForm /></div></main>;
}
