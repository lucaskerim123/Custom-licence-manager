import Link from 'next/link';

type NavKey = 'overview' | 'licenses' | 'installations' | 'products' | 'base' | 'releases' | 'users' | 'settings' | 'api';

const links: { key: NavKey; href: string; label: string }[] = [
  { key: 'overview', href: '/', label: 'Overview' },
  { key: 'licenses', href: '/licenses', label: 'Licenses' },
  { key: 'installations', href: '/installations', label: 'Installations' },
  { key: 'products', href: '/products', label: 'Products' },
  { key: 'base', href: '/releases/base', label: 'Base Deployment' },
  { key: 'releases', href: '/releases', label: 'Releases & Updates' },
  { key: 'users', href: '/users', label: 'Users' },
  { key: 'settings', href: '/settings', label: 'System Settings' },
  { key: 'api', href: '/api-docs', label: 'API Contract' },
];

export default function SideNav({ active }: { active?: NavKey }) {
  return <aside className="side"><div className="brand">License Manager</div><nav className="nav">{links.map(link => <Link key={link.key} className={active === link.key ? 'active' : undefined} href={link.href}>{link.label}</Link>)}</nav><form action="/api/auth/logout" method="post"><button className="nav-button" type="submit">Sign out</button></form></aside>;
}
