# OrbitFS License Master V2 — Vercel deployment

## Deploy
Import this repository into any Vercel account or team you control. Use the repository root and the Next.js preset.

Install command: `npm ci`

Build command: `npm run build`

Production branch: `main`

## Environment variables
Configure these in Vercel Production, Preview and Development as required:

`DATABASE_URL` — PostgreSQL connection string for the License Master database

`DATABASE_SSL` — `true` for hosted PostgreSQL

`SUPABASE_POOLER_HOST` — optional; only needed when using the supported Supabase pooler configuration

`INTEGRATION_API_TOKEN` — legacy/bootstrap integration credential; managed API keys created inside License Master are preferred for Billing Store and deployment clients

`LICENSE_MANAGER_INGEST_TOKEN` — server-only secret used by the GitHub release-intake workflow

`LICENSE_MANAGER_INGEST_URL` — public URL of the release-intake endpoint

`BOOTSTRAP_ADMIN_EMAIL` — optional initial administrator

`BOOTSTRAP_ADMIN_PASSWORD` — optional initial administrator password

Never commit real values or expose server secrets as `NEXT_PUBLIC_*` variables.

## API boundary
License Master is the authoritative licensing and release system. Its own admin UI reads/writes its own database directly through server-side application code. External systems such as V2 Billing Store communicate with License Master through its authenticated API.

V2 Billing Store uses its server-only `BILLING_API_TOKEN` for licensing, products and release reads. Deployment operations use the separate `DEPLOYER_API_TOKEN` where configured.

The old License API and old database are not required by this repository.

## New-account setup
1. Import `main` into the new Vercel account.
2. Create/configure the PostgreSQL database for License Master.
3. Add the variables from `.env.example`.
4. Deploy.
5. Complete `/setup` if bootstrap values were not used.
6. In License Master, create the managed API keys required by Billing Store and deployment clients.
7. Put the resulting server-only credentials into the V2 Billing Store Vercel project.

No License Master private signing material should be placed in the Billing Store project.
