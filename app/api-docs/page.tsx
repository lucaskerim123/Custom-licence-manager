import {requireUser} from '../../lib/session';
import SideNav from '../components/SideNav';
import PageHeader from '../components/PageHeader';
export const dynamic='force-dynamic';
const blocks=[
 ['Authentication',`Authorization: Bearer <managed License Master API key>`,'Keep integration credentials private and use HTTPS. Customer license validation is the exception: it authenticates with the license key itself.'],
 ['Issue a license',`POST /api/v1/license

{
  "product": "orbitfs",
  "customer_external_id": "customer-123",
  "external_reference": "order-456",
  "expires_at": "2030-01-01T00:00:00Z",
  "metadata": {}
}`,'License issuance remains inside the License Manager authority.'],
 ['Installed-product validation',`POST /api/v1/license/validate

{
  "license_key": "LIC-...",
  "product": "orbitfs",
  "installation_id": "machine-123",
  "product_version": "2.0.0"
}`,'Public endpoint. The license key is the client credential; no customer-specific License Master integration token is required.'],
 ['Release intake',`GET /api/v1/releases?product=orbitfs&channel=stable&type=update
GET /api/v1/releases?product=orbitfs&channel=stable&type=base
POST /api/v1/releases`,'Release builders submit candidates through the canonical versioned release API.'],
 ['Updater',`GET /api/v1/updater?product=orbitfs_base&channel=stable&type=base
GET /api/v1/updater?product=orbitfs_base&channel=stable&type=update`,'Customer update/base clients validate their license and retrieve only published, approved releases.'],
 ['Deployer',`POST /api/v1/deployer`,'Customer deployers use the License Master deployment authority for authorization and deployment telemetry; execution remains in the customer installation.']
];
export default async function ApiDocs(){await requireUser();return <div className="shell"><SideNav active="api"/><main className="main"><PageHeader eyebrow="System / Integration" title="API Contract" description="The external integration surface for Billing Store, products, release builders and deployment clients." badge="V1"/><section className="api-hero card"><div><strong>Authority boundary</strong><p>External integrations use the versioned /api/v1 contract. The admin UI uses the same core services directly and does not loop through its own public API.</p></div><span className="badge ok">AUTHORITATIVE</span></section>{blocks.map(([title,code,note])=><section className="section card" key={title}><div className="section-head"><div><h2>{title}</h2><p className="muted">{note}</p></div></div><pre className="code-panel">{code}</pre></section>)}</main></div>}