create extension if not exists pgcrypto;

create table if not exists system_settings (
  id boolean primary key default true,
  system_name text not null default 'License Manager',
  system_enabled boolean not null default true,
  licensing_enabled boolean not null default true,
  maintenance_mode boolean not null default false,
  updated_at timestamptz not null default now(),
  check (id = true)
);
insert into system_settings(id) values(true) on conflict do nothing;

create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  description text,
  status text not null default 'active' check(status in ('active','disabled','archived')),
  validation_policy jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists licenses (
  id uuid primary key default gen_random_uuid(),
  license_key_hash text unique not null,
  license_key_last4 text not null,
  product_id uuid not null references products(id),
  customer_external_id text,
  billing_order_id text,
  status text not null default 'active' check(status in ('pending','active','suspended','revoked','expired')),
  issued_at timestamptz not null default now(),
  expires_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists activations (
  id uuid primary key default gen_random_uuid(),
  license_id uuid not null references licenses(id) on delete cascade,
  installation_id text not null,
  product_version text,
  last_seen_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  unique(license_id, installation_id)
);

create table if not exists releases (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id),
  channel text not null default 'stable',
  version text not null,
  release_type text not null check(release_type in ('base','update')),
  source_repo text,
  source_ref text,
  artifact_url text,
  status text not null default 'draft' check(status in ('draft','published','disabled')),
  notes text,
  created_at timestamptz not null default now(),
  unique(product_id, channel, version, release_type)
);

create table if not exists audit_events (
  id uuid primary key default gen_random_uuid(),
  actor text not null,
  action text not null,
  resource_type text,
  resource_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists licenses_product_idx on licenses(product_id);
create index if not exists licenses_customer_idx on licenses(customer_external_id);
create index if not exists activations_license_idx on activations(license_id);
create index if not exists releases_product_idx on releases(product_id);
create index if not exists audit_created_idx on audit_events(created_at desc);
