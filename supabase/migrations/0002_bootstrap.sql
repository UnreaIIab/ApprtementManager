-- =====================================================================
-- Bootstrap: storage buckets + first-owner setup
-- =====================================================================
-- Run AFTER 0001_init.sql, then create your first user through Supabase Auth
-- (Authentication -> Users -> Add user) and execute the `bootstrap_workspace`
-- call at the bottom.
--
-- Everything in the app is scoped by `org_id`, and RLS resolves that through
-- the `memberships` table — so a user with no membership sees an empty
-- workspace rather than an error. This script creates the organisation and the
-- membership that link them.
--
-- This file is idempotent: every statement is guarded, so it is safe to re-run.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Workspace bootstrap
-- ---------------------------------------------------------------------

-- Creates an organisation and makes `user_email` its owner.
create or replace function public.bootstrap_workspace(
  user_email   text,
  org_name     text default 'My Property Company',
  org_currency text default 'EUR',
  org_timezone text default 'Europe/Lisbon'
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_user uuid;
  new_org     uuid;
begin
  select id into target_user from auth.users where email = user_email;
  if target_user is null then
    raise exception 'No auth user with email %. Create the user first.', user_email;
  end if;

  -- Reuse an existing membership rather than stacking up empty organisations.
  select org_id into new_org from memberships
  where user_id = target_user and role = 'owner'
  limit 1;

  if new_org is null then
    insert into organizations (name, currency, timezone)
    values (org_name, org_currency, org_timezone)
    returning id into new_org;
  end if;

  insert into memberships (org_id, user_id, role)
  values (new_org, target_user, 'owner')
  on conflict (org_id, user_id) do update set role = 'owner';

  insert into properties (org_id, name)
  select new_org, org_name || ' Portfolio'
  where not exists (select 1 from properties where org_id = new_org);

  return new_org;
end;
$$;

-- This is an administrative helper, not an API endpoint. PostgREST exposes
-- everything in `public`, and it is SECURITY DEFINER with an email parameter —
-- left reachable, an anonymous caller could enumerate accounts and create
-- organisations for arbitrary users. It stays callable from the SQL editor,
-- where the session is `postgres` and function privileges do not apply.
revoke all on function public.bootstrap_workspace(text, text, text, text)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Run this once, with your own email:
-- ---------------------------------------------------------------------
-- select public.bootstrap_workspace('you@example.com', 'Atlas Stays', 'EUR', 'Europe/Lisbon');

-- ---------------------------------------------------------------------
-- Storage
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values
  ('apartment-images', 'apartment-images', true),
  ('documents', 'documents', false),
  ('invoices', 'invoices', false)
on conflict (id) do nothing;

/*
 * Object paths are `{org_id}/{entity}/{entity_id}/{filename}`.
 *
 * The leading folder is what makes storage multi-tenant: without it, "any
 * authenticated user" policies would let a member of one organisation read
 * another organisation's guest ID scans and invoices. Scoping every rule to the
 * org in the path closes that, and mirrors the `org_id` check RLS applies to
 * every table.
 */
create or replace function public.storage_org_id(object_name text)
returns uuid
language plpgsql
immutable
as $$
begin
  return ((storage.foldername(object_name))[1])::uuid;
exception
  -- A path that doesn't start with a UUID belongs to no organisation, so it
  -- must not match any policy. Returning null achieves that: is_org_member(null)
  -- is false, rather than raising and failing the whole query.
  when others then return null;
end;
$$;

-- Policies are dropped first because Postgres has no `create policy if not
-- exists`, and this script is meant to be safe to re-run.
drop policy if exists "apartment images are publicly readable" on storage.objects;
drop policy if exists "members manage apartment images"        on storage.objects;
drop policy if exists "members read private files"             on storage.objects;
drop policy if exists "members write private files"            on storage.objects;
drop policy if exists "members upload apartment images"        on storage.objects;
drop policy if exists "members update apartment images"        on storage.objects;
drop policy if exists "members delete apartment images"        on storage.objects;
drop policy if exists "members read org files"                 on storage.objects;
drop policy if exists "members upload org files"               on storage.objects;
drop policy if exists "members update org files"               on storage.objects;
drop policy if exists "members delete org files"               on storage.objects;

-- Apartment photos appear in guest-facing listings, so reads stay public.
create policy "apartment images are publicly readable"
  on storage.objects for select
  using (bucket_id = 'apartment-images');

create policy "members upload apartment images"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'apartment-images'
    and public.is_org_member(public.storage_org_id(name))
  );

create policy "members update apartment images"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'apartment-images'
    and public.is_org_member(public.storage_org_id(name))
  );

create policy "members delete apartment images"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'apartment-images'
    and public.is_org_member(public.storage_org_id(name))
  );

-- Guest documents and invoices are private in both directions, and readable
-- only by members of the organisation that owns them.
create policy "members read org files"
  on storage.objects for select to authenticated
  using (
    bucket_id in ('documents', 'invoices')
    and public.is_org_member(public.storage_org_id(name))
  );

create policy "members upload org files"
  on storage.objects for insert to authenticated
  with check (
    bucket_id in ('documents', 'invoices')
    and public.is_org_member(public.storage_org_id(name))
  );

create policy "members update org files"
  on storage.objects for update to authenticated
  using (
    bucket_id in ('documents', 'invoices')
    and public.is_org_member(public.storage_org_id(name))
  );

create policy "members delete org files"
  on storage.objects for delete to authenticated
  using (
    bucket_id in ('documents', 'invoices')
    and public.is_org_member(public.storage_org_id(name))
  );
