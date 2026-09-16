# Custom License Manager

Standalone licensing authority and deployment/release control plane for OrbitFS and other products. This application has its **own users, authentication, PostgreSQL database, settings and administration**. It does not require Billing Store to run.

## Authority boundary

- **Users/auth:** local accounts and server-side sessions belong to this application.
- **License authority:** issuing, hashing, status, enforcement and validation decisions live here.
- **Products:** product records and validation policies live here.
- **Base deployment:** published base-installation artifacts and source refs live here.
- **Update releaser:** published update releases, channels, versions and checksums live here.
- **System controls:** online/offline, licensing authority and maintenance mode are controlled locally.
- **Audit:** administrative and integration actions are recorded here.
- **External systems:** Billing Store and product/deployment clients connect to the integration API. They are clients of this system, not dependencies of it.

## Database

For a new database, run `database/schema.sql`. For an existing database created by an earlier version, run `database/migrate.sql` after the schema. The schema uses PostgreSQL foreign keys, unique constraints, status checks, indexes and timestamp triggers.

Create the first administrator with:

```bash
npm install
npm run bootstrap-admin
```

using `DATABASE_URL`, `DATABASE_SSL`, `BOOTSTRAP_ADMIN_EMAIL` and `BOOTSTRAP_ADMIN_PASSWORD`. The bootstrap command creates or resets the local owner account; it does not contact Billing Store.

## Local development

```bash
npm install
npm run dev
```

## Vercel

Deploy this repository as a Next.js project. Configure the variables in `.env.example`. Keep `DATABASE_URL`, `INTEGRATION_API_TOKEN` and administrator bootstrap credentials server-side; do not use `NEXT_PUBLIC_` for secrets.

## External integration API

All external integration requests use `Authorization: Bearer INTEGRATION_API_TOKEN`.

| Endpoint | Purpose |
|---|---|
| `POST /api/license/issue` | External system requests a new license |
| `POST /api/license/validate` | Product validates a license |
| `GET /api/deployment/base?product=<slug>` | Retrieves latest published base deployment |
| `GET /api/releases` | Retrieves release metadata |
| `POST /api/releases` | Creates a base or update release |

Billing Store can call these endpoints for its licensing, base deployment and release/update workflows. **There is no Billing Store endpoint, database dependency, callback requirement or Billing Store user system inside this application.**

## Security model

The browser admin UI authenticates against the local `users` and `user_sessions` tables. External integrations use the separate integration token. License keys are stored only as SHA-256 hashes; the plaintext key is returned only in the issuance response and is not persisted.
