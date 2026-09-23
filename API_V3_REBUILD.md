# License Master API v3 rebuild

This branch isolates the production API contract for OrbitFS licensing, release distribution, and deployment authorization.

## Canonical base

`https://incendiarynetworks.cc/api`

All external integration routes use `/api/v1`.

## Authentication model

- `POST /api/v1/license/validate` is public to installed products. The license key is the credential.
- License issuance, release intake/management, and deployment authorization require a server-to-server API credential.
- Customer installations do not receive a master integration token.
- Provider credentials stay inside the customer deployer.

## License

- `POST /api/v1/license` — issue a license.
- `POST /api/v1/license/validate` — validate a license key against product, installation and version.
- `GET /api/v1/license/health` — connectivity/database/capability health check.
- `GET /api/v1/license` — authenticated license registry.
- `POST /api/v1/license/{id}/control` — lifecycle controls.

## Products

- `GET /api/v1/products` — active product catalogue.

## Releases

- `GET /api/v1/releases` — list releases with product/channel/type filters.
- `POST /api/v1/releases` — release intake.
- `GET|POST /api/v1/releases/{id}` — release operations.
- `GET /api/v1/releases/{id}/artifact` — artifact retrieval.
- `POST /api/v1/releases/{id}/validate` — technical validation.
- `GET|POST /api/v1/updater` — customer release/update retrieval.

A release carries product, version, release type, source repository/ref/commit, changelog, manifest, artifact metadata, SHA-256 checksum, file count/components and validation/audit state. Only technically validated and approved releases become deployable.

## Deployment

- `POST /api/v1/deployer` — authorize deployment and record deployment telemetry.
- Base deploys, updates, redeploys and rollbacks are release-manifest driven.
- The License Manager authorizes and records deployment state; the customer installation executes the provider deployment.

## OrbitFS product model

The canonical product is `orbitfs`.

Components:

- `orbitfs_base`
- `orbitfs_mcp`
- `orbitfs_apex`
- `orbitfs_studio`

Add-ons require the base product.

## Release authority

1. Release builder produces artifact, manifest, changelog and checksum.
2. License Manager accepts and technically validates the candidate.
3. Admin/customer-facing publication remains a separate review gate.
4. Customer deployer retrieves an approved release and executes it locally.

The License Manager remains the technical licensing/release/deployment authority and does not become the commerce system.
