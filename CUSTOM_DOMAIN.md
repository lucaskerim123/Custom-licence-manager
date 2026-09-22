# Production License Master domains

The License Master deployment uses one application with two public hostnames:

- Admin panel UI: `https://panel.incendiarynetworks.cc`
- External API: `https://incendiarynetworks.cc/api`

Both hostnames must point to the same Vercel deployment of `Custom-licence-manager`. The API hostname is the canonical authority for customer license authorization and release-system integrations.

## API contract

The external API is rooted at `/api` and the current runtime endpoints include:

- `GET /api/v1/license/health`
- `POST /api/v1/license`
- `POST /api/v1/license/validate` — public license validation (license key is the client credential)
- `POST /api/v1/license/validate` — internal/integration-authenticated validation endpoint
- `POST /api/v1/license/{id}/control`
- `GET /api/v1/products`
- `GET /api/v1/license`
- `GET /api/health`
- release and deployment endpoints under `/api/*`

The admin UI is not the API authority URL. Billing Store, OrbitFS Base/license controller, release/deployer clients, and other external systems should use `https://incendiarynetworks.cc/api` as their License Master API base. The browser-facing License Master administration interface should use `https://panel.incendiarynetworks.cc`.

## Vercel

Attach both custom domains to the same License Master Vercel project. Do not use the panel hostname or a Vercel deployment URL as the API authority. DNS/TLS and the Vercel custom-domain configuration are deployment settings rather than repository code, so the repository does not hard-code a Vercel project URL for the admin panel.
