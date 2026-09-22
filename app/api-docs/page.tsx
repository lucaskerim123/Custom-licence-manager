import {requireUser} from '../../lib/session';
import SideNav from '../components/SideNav';
import PageHeader from '../components/PageHeader';
export const dynamic='force-dynamic';
const blocks=[
 ['Authentication',`Authorization: Bearer INTEGRATION_API_TOKEN`,'Keep integration credentials private and use HTTPS.'],
 ['Issue a license',`POST /api/v1/license

{
  "product": "orbitfs",
  "customer_external_id": "customer-123",
  "external_reference": "order-456",
  "expires_at": "2030-01-01T00:00:00Z",
  "metadata": {}
}

Response: { id, license_key, status, expires_at }`,'License issuance remains inside the License Manager authority.'],
 ['Installed-product validation',`POST /api/v1/license/validate

{
  "license_key": "LIC-...",
  "product": "orbitfs",
  "installation_id": "machine-123",
  "product_version": "2.0.0"
}`,'Validation and installation binding are authoritative here.'],
 ['Base deployment',`GET /api/v1/updater?product=orbitfs_base&channel=stable&type=base`,'Returns the latest published base release approved by the authority.'],
 ['Release intake / distribution',`GET /api/v1/releases?product=orbitfs&channel=stable&type=update
GET /api/v1/releases?product=orbitfs&channel=stable&type=base
POST /api/v1/releases`,'Release builders submit candidates. Customer-facing publication is a separate Billing Store gate.']
];
export default async function ApiDocs(){await requireUser();return <div className="shell"><SideNav active="api"/><main className="main"><PageHeader eyebrow="System / Integration" title="API Contract" description="The external integration surface for Billing Store, products, release builders and deployment clients." badge="V1"/><section className="api-hero card"><div><strong>Authority boundary</strong><p>These endpoints are the machine boundary. The admin UI uses the same core services directly and does not loop through its own public API.</p></div><span className="badge ok">AUTHORITATIVE</span></section>{blocks.map(([title,code,note])=><section className="section card" key={title}><div className="section-head"><div><h2>{title}</h2><p className="muted">{note}</p></div></div><pre className="code-panel">{code}</pre></section>)}</main></div>}
