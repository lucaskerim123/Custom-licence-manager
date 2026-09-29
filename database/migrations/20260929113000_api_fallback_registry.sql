begin;

alter table if exists official_api_connections
  add column if not exists connection_role text not null default 'primary',
  add column if not exists failover_enabled boolean not null default false;

update official_api_connections
set connection_role='primary'
where connection_role is null or connection_role not in ('primary','fallback');

alter table if exists official_api_connections
  drop constraint if exists official_api_connections_role_check;
alter table if exists official_api_connections
  add constraint official_api_connections_role_check
  check (connection_role in ('primary','fallback'));

alter table if exists official_api_connections
  drop constraint if exists official_api_connections_url_check;
alter table if exists official_api_connections
  add constraint official_api_connections_url_check check (
    (
      connection_role='primary'
      and base_url ~ '^https://([a-z0-9-]+[.])?incendiarynetworks[.]cc(/|$)'
    )
    or
    (
      connection_role='fallback'
      and base_url ~ '^https://orbitfs-fallback[.]stubengine[.]com(/|$)'
    )
  )
  and (
    (service_key='license_manager' and base_url ~ '/api/v1$')
    or
    (service_key='license_runtime' and base_url ~ '/api/v1/license$')
  )
);

create index if not exists official_api_connections_failover_idx
  on official_api_connections(service_key,connection_role,enabled,priority,updated_at desc);

insert into official_api_connections(
  service_key,label,base_url,allowed_clients,enabled,priority,settings,connection_role,failover_enabled
)
values
 (
  'license_manager',
  'OrbitFS License Manager limp-mode fallback',
  'https://orbitfs-fallback.stubengine.com/api/v1',
  array['billing_store','dev_panel'],
  true,
  900,
  '{"mode":"limp","fallback":true,"restricted":true,"health_path":"/license/health","authority":false,"mutation_policy":"deny","automatic_recovery":true,"failover_on":["network","timeout","502","503","504"]}'::jsonb,
  'fallback',
  true
 ),
 (
  'license_runtime',
  'OrbitFS licence runtime limp-mode fallback',
  'https://orbitfs-fallback.stubengine.com/api/v1/license',
  array['v1_base','v1_engine','billing_store'],
  true,
  900,
  '{"mode":"limp","fallback":true,"restricted":true,"health_path":"/health","authority":false,"mutation_policy":"deny","automatic_recovery":true,"failover_on":["network","timeout","502","503","504"]}'::jsonb,
  'fallback',
  true
 )
on conflict(service_key,base_url) do update set
  label=excluded.label,
  allowed_clients=excluded.allowed_clients,
  enabled=excluded.enabled,
  priority=excluded.priority,
  settings=official_api_connections.settings || excluded.settings,
  connection_role=excluded.connection_role,
  failover_enabled=excluded.failover_enabled,
  updated_at=now();

comment on column official_api_connections.connection_role is
  'primary is authoritative. fallback is availability-only limp mode and must never create authority decisions.';
comment on column official_api_connections.failover_enabled is
  'Whether approved downstream clients may automatically use this fallback after primary transport failure.';

commit;
