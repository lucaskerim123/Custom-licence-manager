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
alter table if exists audit_events add column if not exists actor_user_id uuid references users(id) on delete set null;
create index if not exists users_status_idx on users(status);create index if not exists sessions_user_idx on user_sessions(user_id);create index if not exists licenses_status_idx on licenses(status);create index if not exists releases_lookup_idx on releases(product_id,channel,status,release_type);create index if not exists releases_review_idx on releases(review_status,release_type,created_at desc);create index if not exists activations_last_seen_idx on activations(last_seen_at desc);
create or replace function touch_updated_at() returns trigger language plpgsql as $$ begin new.updated_at=now(); return new; end $$;
drop trigger if exists users_touch on users;create trigger users_touch before update on users for each row execute function touch_updated_at();drop trigger if exists products_touch on products;create trigger products_touch before update on products for each row execute function touch_updated_at();drop trigger if exists licenses_touch on licenses;create trigger licenses_touch before update on licenses for each row execute function touch_updated_at();
