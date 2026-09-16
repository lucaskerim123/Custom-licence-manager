# Custom License Manager

Independent licensing and deployment control plane designed to connect to `lucaskerim123/V2_Billing_Store` while keeping licensing authority inside this application.

## Architecture

- **License authority:** issuing, status, enforcement and validation decisions live here.
- **Products:** product records and validation policies live here.
- **Base deployment:** release records identify base-installation artifacts and source refs.
- **Update releaser:** release records support existing-installation updates, channels and versions.
- **Billing Store:** exchanges customer/order/payment context through authenticated API calls. It does **not** create or sign licenses.
- **Products:** call `/api/license/validate` for an authoritative license decision.
- **Admin UI:** uses the application's own server-side database functions. It does not call its own public API to manage settings/products/licenses.

This separation prevents the admin panel from becoming dependent on its own external integration API.

## Database

Run `database/schema.sql` against the PostgreSQL database configured by `DATABASE_URL`.

## Local development

```bash
npm ci
npm run dev
```

## Vercel

Create a Vercel project from this repository, use the Next.js preset, and configure the variables in `.env.example`. Keep all service tokens server-side; never expose them with `NEXT_PUBLIC_`.

## External API

| Endpoint | Purpose | Auth |
|---|---|---|
| `POST /api/license/validate` | Product license validation | Public integration boundary |
| `POST /api/billing/orders` | Billing Store -> Master order context | `BILLING_API_TOKEN` |
| `GET/POST /api/releases` | Release/deployer integration | `DEPLOYER_API_TOKEN` |
| `GET/PATCH /api/admin/settings` | External administration automation | `ADMIN_API_TOKEN` |

## Reference architecture

The structure follows the authority boundary established in `OrbitFS-License-Master-V2`: the Master owns licensing and release authority, while `V2_Billing_Store` remains the customer/order/billing system. The reference repository documents the same separation and service-token model.
