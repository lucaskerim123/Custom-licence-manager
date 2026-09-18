-- Published release records are immutable. New builds for an existing version must create a new revision.
create or replace function prevent_published_release_mutation() returns trigger language plpgsql as $$
begin
  if old.status='published' then
    if new.product_id is distinct from old.product_id
      or new.channel is distinct from old.channel
      or new.version is distinct from old.version
      or new.release_type is distinct from old.release_type
      or new.source_repo is distinct from old.source_repo
      or new.source_ref is distinct from old.source_ref
      or new.artifact_url is distinct from old.artifact_url
      or new.checksum is distinct from old.checksum
      or new.status is distinct from old.status
      or new.review_status is distinct from old.review_status
      or new.deployment_status is distinct from old.deployment_status
      or new.source_sha is distinct from old.source_sha
      or new.artifact_name is distinct from old.artifact_name
      or new.artifact_repo is distinct from old.artifact_repo
      or new.artifact_run_id is distinct from old.artifact_run_id
      or new.vercel_ready is distinct from old.vercel_ready
      or new.supabase_ready is distinct from old.supabase_ready
      or new.customer_publication_repo is distinct from old.customer_publication_repo
      or new.notes is distinct from old.notes
      or new.manifest is distinct from old.manifest
      or new.revision is distinct from old.revision
      or new.supersedes_release_id is distinct from old.supersedes_release_id
      or new.published_at is distinct from old.published_at then
      raise exception 'Published releases are immutable; create a new revision';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists releases_immutable_published on public.releases;
create trigger releases_immutable_published before update on public.releases for each row execute function prevent_published_release_mutation();
