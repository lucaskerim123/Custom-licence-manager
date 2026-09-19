alter table if exists public.release_channels add column if not exists access_mode text not null default 'closed';
update public.release_channels set access_mode='open' where channel='stable' or access_mode='all';
update public.release_channels set access_mode='closed' where access_mode not in ('open','closed');
alter table public.release_channels drop constraint if exists release_channels_access_mode_check;
alter table public.release_channels add constraint release_channels_access_mode_check check (access_mode in ('open','closed'));
create index if not exists release_channels_access_idx on public.release_channels(enabled,access_mode,sort_order);
