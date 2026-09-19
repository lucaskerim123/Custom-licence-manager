-- Run this against an existing installation before deploying the current application.
create extension if not exists pgcrypto;

create table if not exists users (
  id uuid primary key default gen_random_uuid(), email text unique not null, password_hash text not null, password_salt text not null,
  display_name text not null, role text not null default 'admin' check(role in ('owner','admin','operator','viewer')),
  status text not null default 'active' check(status in ('active','disabled')), created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(), last_login_at timestamptz
);
create table if not exists user_sessions (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references users(id) on delete cascade,
  token_hash text unique not null, expires_at timestamptz not null, created_at timestamptz not null default now(), last_seen_at timestamptz not null default now(), user_agent text, ip_address text
);
alter table if exists system_settings add column if not exists release_system_enabled boolean not null default true;
alter table if exists system_settings add column if not exists deployment_enabled boolean not null default true;
alter table if exists user_sessions add column if not exists user_agent text;
alter table if exists user_sessions add column if not exists ip_address text;
alter table if exists licenses add column if not exists external_reference text;
alter table if exists licenses add column if not exists customer_override boolean not null default false;
alter table if exists activations add column if not exists status text not null default 'active';
alter table if exists releases add column if not exists checksum text;
alter table if exists releases add column if not exists published_at timestamptz;
alter table if exists releases add column if not exists review_status text not null default 'pending';
alter table if exists releases add column if not exists deployment_status text not null default 'not_started';
alter table if exists releases add column if not exists source_sha text;
alter table if exists releases add column if not exists artifact_name text;
alter table if exists releases add column if not exists artifact_repo text;
alter table if exists releases add column if not exists artifact_run_id bigint;
alter table if exists releases add column if not exists vercel_ready boolean not null default false;
alter table if exists releases add column if not exists supabase_ready boolean not null default false;
alter table if exists releases add column if not exists customer_publication_repo text;
alter table if exists releases add column if not exists manifest jsonb not null default '{}'::jsonb;
alter table if exists releases add column if not exists revision integer not null default 1;
alter table if exists releases add column if not exists supersedes_release_id uuid references releases(id) on delete set null;
alter table if exists releases add column if not exists archived_at timestamptz;
alter table if exists releases add column if not exists archived_by uuid references users(id) on delete set null;
alter table if exists releases drop constraint if exists releases_product_id_channel_version_release_type_key;
create index if not exists releases_revision_idx on releases(product_id,channel,version,release_type,revision desc);
create index if not exists releases_archived_idx on releases(archived_at,release_type,created_at desc);
alter table if exists audit_events add column if not exists actor_user_id uuid references users(id) on delete set null;
create index if not exists users_status_idx on users(status);create index if not exists sessions_user_idx on user_sessions(user_id);create index if not exists licenses_status_idx on licenses(status);create index if not exists licenses_customer_idx on licenses(customer_external_id);create index if not exists licenses_override_idx on licenses(customer_override);create index if not exists activations_status_idx on activations(status);create index if not exists activations_last_seen_idx on activations(last_seen_at desc);create index if not exists releases_lookup_idx on releases(product_id,channel,status,release_type);create index if not exists releases_review_idx on releases(review_status,release_type,created_at desc);
alter table if exists activations drop constraint if exists activations_status_check;
alter table if exists activations add constraint activations_status_check check(status in ('active','locked','terminated'));
create or replace function touch_updated_at() returns trigger language plpgsql as $ begin new.updated_at=now(); return new; end $;
drop trigger if exists users_touch on users;create trigger users_touch before update on users for each row execute function touch_updated_at();drop trigger if exists products_touch on products;create trigger products_touch before update on products for each row execute function touch_updated_at();drop trigger if exists licenses_touch on licenses;create trigger licenses_touch before update on licenses for each row execute function touch_updated_at();

create table if not exists deployment_events (
  id uuid primary key default gen_random_uuid(),
  license_id uuid references licenses(id) on delete set null,
  activation_id uuid references activations(id) on delete set null,
  installation_id text,
  release_id uuid references releases(id) on delete set null,
  action text not null check(action in ('deploy','update','redeploy','rollback')),
  phase text not null check(phase in ('authorize','started','completed','failed')),
  product text,
  product_version text,
  previous_version text,
  deployment_id text,
  deployment_url text,
  project_id text,
  project_name text,
  provider text,
  region text,
  platform text,
  architecture text,
  hostname text,
  client text,
  client_version text,
  source_ip text,
  user_agent text,
  customer_identity jsonb not null default '{}'::jsonb,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table if exists activations add column if not exists first_seen_at timestamptz not null default now();
alter table if exists activations add column if not exists last_ip text;
alter table if exists activations add column if not exists last_user_agent text;
alter table if exists activations add column if not exists last_hostname text;
alter table if exists activations add column if not exists last_platform text;
alter table if exists activations add column if not exists last_architecture text;
alter table if exists activations add column if not exists last_client text;
alter table if exists activations add column if not exists last_client_version text;
alter table if exists activations add column if not exists last_provider text;
alter table if exists activations add column if not exists last_region text;
alter table if exists activations add column if not exists last_deployment_id text;
alter table if exists activations add column if not exists last_deployment_url text;
alter table if exists activations add column if not exists last_deployment_status text;
alter table if exists activations add column if not exists last_operation text;
alter table if exists activations add column if not exists deployment_count integer not null default 0;
alter table if exists activations add column if not exists current_components jsonb not null default '{}'::jsonb;
create index if not exists deployment_events_installation_idx on deployment_events(installation_id,created_at desc);
create index if not exists deployment_events_license_idx on deployment_events(license_id,created_at desc);
create index if not exists deployment_events_release_idx on deployment_events(release_id,created_at desc);
create index if not exists deployment_events_deployment_idx on deployment_events(deployment_id);
