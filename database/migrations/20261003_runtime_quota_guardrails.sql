-- Reduce steady-state Supabase traffic without changing licensing authority.
-- Runtime clients keep a one-minute pulse path for urgent authority changes while
-- successful validation state can be cached for five minutes.

alter table public.system_settings
  alter column validation_ttl_seconds set default 300,
  alter column pulse_poll_seconds set default 60;

do $$
declare
  v_revision bigint;
begin
  update public.system_settings
     set validation_ttl_seconds=greatest(validation_ttl_seconds,300),
         pulse_poll_seconds=greatest(pulse_poll_seconds,60),
         pulse_revision=coalesce(pulse_revision,0)+1,
         pulse_at=now(),
         pulse_reason='runtime-policy-quota-guardrail',
         updated_at=now()
   where id=true
     and (validation_ttl_seconds<300 or pulse_poll_seconds<60)
  returning pulse_revision into v_revision;

  if v_revision is not null then
    insert into public.audit_events(actor_user_id,actor,action,resource_type,details)
    values(
      null,
      'migration:20261003_runtime_quota_guardrails',
      'settings.runtime_policy',
      'system_settings',
      jsonb_build_object(
        'validation_ttl_seconds',300,
        'pulse_poll_seconds',60,
        'reason','supabase_quota_guardrail'
      )
    );

    if to_regclass('public.license_pulses') is not null then
      insert into public.license_pulses(
        revision,action,scope,reason,payload,requires_ack,created_by_user_id,created_by
      )
      values(
        v_revision,
        'refresh_runtime_policy',
        'global',
        'runtime-policy-quota-guardrail',
        jsonb_build_object(
          'validation_ttl_seconds',300,
          'pulse_poll_seconds',60,
          'reason','supabase_quota_guardrail'
        ),
        true,
        null,
        'migration:20261003_runtime_quota_guardrails'
      );
    end if;
  end if;
end $$;
