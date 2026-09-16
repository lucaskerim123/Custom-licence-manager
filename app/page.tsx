import Link from 'next/link';
import { db } from '../lib/db';

export const dynamic = 'force-dynamic';

async function stats() {
  try {
    const pool = db();
    const [licenses, products, releases, settings] = await Promise.all([
      pool.query("select count(*)::int as count from licenses"),
      pool.query("select count(*)::int as count from products where status <> 'archived'"),
      pool.query("select count(*)::int as count from releases where status='published'"),
      pool.query("select system_enabled, licensing_enabled, maintenance_mode from system_settings where id=true")
    ]);
    return { licenses: licenses.rows[0].count, products: products.rows[0].count, releases: releases.rows[0].count, settings: settings.rows[0] ?? { system_enabled:true, licensing_enabled:true, maintenance_mode:false } };
  } catch { return { licenses: 0, products: 0, releases: 0, settings: { system_enabled: true, licensing_enabled: true, maintenance_mode: false } }; }
}

export default async function Home() {
  const s = await stats();
  return <div className="shell"><aside className="side"><div className="brand">License Manager</div><nav className="nav"><Link className="active" href="/">Overview</Link><Link href="/licenses">Licenses</Link><Link href="/products">Products</Link><Link href="/releases">Releases</Link><Link href="/settings">System Settings</Link><Link href="/api-docs">API Contract</Link></nav></aside><main className="main"><div className="top"><div><h1 className="title">Control Plane</h1><div className="muted">Independent authority for licensing, validation, deployment and releases.</div></div><span className={`badge ${s.settings.system_enabled && s.settings.licensing_enabled ? 'ok' : 'off'}`}>{s.settings.system_enabled && s.settings.licensing_enabled ? 'Operational' : 'Restricted'}</span></div><div className="grid"><div className="card"><div className="muted">Licenses</div><div className="metric">{s.licenses}</div></div><div className="card"><div className="muted">Products</div><div className="metric">{s.products}</div></div><div className="card"><div className="muted">Published releases</div><div className="metric">{s.releases}</div></div><div className="card"><div className="muted">Maintenance</div><div className="metric">{s.settings.maintenance_mode ? 'ON' : 'OFF'}</div></div></div><div className="section"><h2>Authority boundary</h2><div className="notice">This application owns license issuance, status, validation decisions, deployment/release metadata and authority controls. Billing exchanges customer/order data with it but never becomes the licensing authority. Products call the public validation API; the admin UI talks directly to the manager's own server functions.</div></div></main></div>;
}
