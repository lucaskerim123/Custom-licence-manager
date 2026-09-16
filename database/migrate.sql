-- Run after database/schema.sql when upgrading an existing installation.
create extension if not exists pgcrypto;

alter table if exists licenses add column if not exists external_reference text;
alter table if exists releases add column if not exists checksum text;
alter table if exists releases add column if not exists published_at timestamptz;
alter table if exists audit_events add column if not exists actor_user_id uuid references users(id) on delete set null;

create table if not exists users (
  id uuid primary key default gen_random_uuid(), email text unique not null, password_hash text not null, password_salt text not null,
  display_name text not null, role text not null default 'admin' check(role in ('owner','admin','operator','viewer')),
  status text not null default 'active' check(status in ('active','disabled')), created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(), last_login_at timestamptz
);
create table if not exists user_sessions (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references users(id) on delete cascade,
  token_hash text unique not null, expires_at timestamptz not null, created_at timestamptz not null default now(), last_seen_at timestamptz not null default now()
);
create index if not exists users_status_idx on users(status);
create index if not exists sessions_user_idx on user_sessions(user_id);
create index if not exists sessions_expiry_idx on user_sessions(expires_at);
create index if not exists licenses_status_idx on licenses(status);
create index if not exists releases_lookup_idx on releases(product_id,channel,status,release_type);
