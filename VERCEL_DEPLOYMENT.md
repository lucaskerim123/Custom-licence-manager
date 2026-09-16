# OrbitFS License Master V2 — Vercel deployment

## Deploy
Import this repository into any Vercel account or team you control. Use the repository root and the Next.js preset.

Install command: `npm ci`

Build command: `npm run build`

Production branch: `main`

## Environment variables
Configure these in Vercel Production, Preview and Development as required:

`DATABASE_URL` — PostgreSQL connection string for the License Master database.

`DATABASE_SSL` — `true` for hosted PostgreSQL.

`SUPABASE_POOLER_HOST` — optional; only needed when using the supported Supabase pooler configuration.

`INTEGRATION_API_TOKEN` — optional legacy/bootstrap integration credential. Managed API keys created inside License Master are preferred.

`MASTER_API_TOKEN`, `BILLING_API_TOKEN`, `DEPLOYER_API_TOKEN` — optional machine-key fallbacks. They can use the same value when that key has the required scopes, but managed API keys are preferred and are stored in the License Master database.

`ADMIN_API_TOKEN` — optional server-to-server admin credential for endpoints that explicitly use the admin API token.

`GITHUB_RELEASE_TOKEN` — required when the Base source repository is private and License Master must proxy GitHub release assets. Use a fine-grained GitHub token with Contents: Read-only access to `lucaskerim123/V1-vercel-base`.

`BOOTSTRAP_ADMIN_EMAIL` — optional initial administrator.

`BOOTSTRAP_ADMIN_PASSWORD` — optional initial administrator password.

Never commit real values or expose server secrets as `NEXT_PUBLIC_*` variables.

## Base release pipeline
`lucaskerim123/V1-vercel-base` builds and packages the complete Base release on demand. The GitHub Actions workflow sends the release metadata to `POST /api/internal/releases/ingest` using a License Master managed API key with the `releases.write` scope.

Because the Base repository is private, the workflow stores the GitHub release asset as an API release-asset URL. License Master uses `GITHUB_RELEASE_TOKEN` to retrieve the private asset and proxies it through the authenticated release artifact endpoint. GitHub's release-asset API supports fine-grained tokens with Contents: Read-only access. citeturn2search0

The resulting flow is:

`V1-vercel-base` → GitHub Release asset → License Master intake → review/approval → authenticated License Master artifact endpoint → Billing Store/customer deployment flow.

## API boundary
License Master is the authoritative licensing, release and deployment-control system. Its own admin UI reads/writes its own database through server-side application code. External systems such as V2 Billing Store communicate with License Master through authenticated API keys.

V2 Billing Store uses its server-only `BILLING_API_TOKEN` for licensing, products and release operations. Deployment operations use `DEPLOYER_API_TOKEN`. These can be the same managed API key if the key was created with both sets of scopes.

The old License API and old database are not required by this repository.

## New-account setup
1. Import `main` into the new Vercel account.
2. Create/configure the PostgreSQL database for License Master.
3. Add the variables from `.env.example`.
4. Add `GITHUB_RELEASE_TOKEN` if `V1-vercel-base` remains private.
5. Deploy.
6. Complete `/setup` if bootstrap values were not used.
7. In License Master, create a managed API key for Billing Store with the required licensing/release scopes and deployment scopes if the same key will be used for deployment.
8. Put that key into the V2 Billing Store Vercel project as the server-only `BILLING_API_TOKEN` and, if applicable, `DEPLOYER_API_TOKEN`.
9. Put a managed API key with `releases.write` into the `V1-vercel-base` GitHub Actions secret `LICENSE_MASTER_API_TOKEN`.

No License Master private signing material should be placed in the Billing Store project.
