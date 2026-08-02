-- =====================================================================
-- Supabase stand-ins, for running the migrations against a stock Postgres
-- =====================================================================
-- Supabase provides `auth`, `storage` and the `anon` / `authenticated` roles.
-- A plain PostgreSQL install does not, so the migrations cannot be executed —
-- and therefore cannot be checked — without these.
--
-- This is test scaffolding. It is never run against a real Supabase project.
--
--   createdb pmscheck
--   psql -d pmscheck -f supabase/tests/stub.sql
--   psql -d pmscheck -f supabase/migrations/0001_init.sql   # …and the rest
--   psql -d pmscheck -f supabase/tests/numbering.sql
-- =====================================================================

create extension if not exists "pgcrypto";

create schema if not exists auth;
create schema if not exists storage;

create table if not exists auth.users (
  id                  uuid primary key default gen_random_uuid(),
  email               text unique,
  raw_user_meta_data  jsonb default '{}'::jsonb,
  created_at          timestamptz default now()
);

-- Supabase derives this from the request JWT. Here it reads a session setting,
-- so a test can impersonate a user with
-- `select set_config('request.jwt.claim.sub', '<uuid>', true)`.
create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

create table if not exists storage.buckets (
  id     text primary key,
  name   text not null,
  public boolean not null default false
);

create table if not exists storage.objects (
  id         uuid primary key default gen_random_uuid(),
  bucket_id  text references storage.buckets(id),
  name       text,
  owner      uuid,
  created_at timestamptz default now()
);
alter table storage.objects enable row level security;

create or replace function storage.foldername(name text) returns text[]
language sql immutable as $$
  select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1];
$$;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon;
  end if;
end $$;

-- Supabase grants these by default. Without them the RLS checks would fail on
-- privileges before any policy was consulted — which would look like an RLS
-- pass for entirely the wrong reason.
grant usage on schema public, storage to anon, authenticated;
alter default privileges in schema public grant all on tables to anon, authenticated;
