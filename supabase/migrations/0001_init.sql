-- =====================================================================
-- Apartment Rental Management System — core schema
-- PostgreSQL / Supabase
-- =====================================================================
-- Design notes:
--   * Every tenant-owned row carries `org_id` so multi-property companies
--     are isolated by RLS from day one.
--   * Money is stored in minor units (integer cents) to avoid float drift.
--   * Enums are Postgres native types so the DB rejects bad states.
-- =====================================================================

create extension if not exists "pgcrypto";
create extension if not exists "btree_gist";

-- ---------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------
create type apartment_status as enum (
  'available', 'occupied', 'cleaning', 'maintenance', 'blocked', 'reserved'
);

create type booking_status as enum (
  'pending', 'confirmed', 'checked_in', 'checked_out', 'cancelled', 'no_show'
);

create type booking_source as enum (
  'airbnb', 'booking_com', 'direct', 'expedia', 'vrbo', 'other'
);

create type payment_method as enum (
  'cash', 'bank_transfer', 'credit_card', 'stripe', 'paypal', 'online'
);

create type payment_status as enum (
  'pending', 'paid', 'partial', 'refunded', 'failed'
);

create type invoice_status as enum (
  'draft', 'sent', 'paid', 'partial', 'overdue', 'void'
);

create type expense_category as enum (
  'utilities', 'cleaning', 'maintenance', 'repairs', 'furniture', 'supplies',
  'taxes', 'insurance', 'marketing', 'commission', 'staff', 'other'
);

create type task_type as enum ('cleaning', 'maintenance');
create type task_status as enum ('pending', 'in_progress', 'done', 'cancelled');

create type member_role as enum ('owner', 'admin', 'manager', 'staff', 'viewer');

-- ---------------------------------------------------------------------
-- Organisations & membership (multi-property foundation)
-- ---------------------------------------------------------------------
create table organizations (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  legal_name    text,
  logo_url      text,
  email         text,
  phone         text,
  address       text,
  tax_id        text,
  currency      text not null default 'USD',
  tax_rate      numeric(5,2) not null default 0,
  timezone      text not null default 'UTC',
  locale        text not null default 'en',
  invoice_prefix text not null default 'INV',
  booking_prefix text not null default 'BK',
  settings      jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text,
  avatar_url  text,
  phone       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table memberships (
  id       uuid primary key default gen_random_uuid(),
  org_id   uuid not null references organizations(id) on delete cascade,
  user_id  uuid not null references auth.users(id) on delete cascade,
  role     member_role not null default 'manager',
  created_at timestamptz not null default now(),
  unique (org_id, user_id)
);
create index on memberships (user_id);

-- ---------------------------------------------------------------------
-- Properties & apartments
-- ---------------------------------------------------------------------
create table properties (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references organizations(id) on delete cascade,
  name       text not null,
  address    text,
  city       text,
  country    text,
  timezone   text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on properties (org_id);

create table apartments (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  property_id   uuid references properties(id) on delete set null,
  code          text not null,
  name          text not null,
  description   text,
  address       text,
  city          text,
  country       text,
  floor         text,
  bedrooms      smallint not null default 1,
  bathrooms     smallint not null default 1,
  beds          smallint not null default 1,
  capacity      smallint not null default 2,
  size_sqm      numeric(7,2),
  status        apartment_status not null default 'available',
  nightly_rate  integer not null default 0,      -- minor units
  cleaning_fee  integer not null default 0,
  weekly_discount  numeric(5,2) not null default 0,
  monthly_discount numeric(5,2) not null default 0,
  min_nights    smallint not null default 1,
  max_nights    smallint,
  amenities     text[] not null default '{}',
  images        text[] not null default '{}',
  cover_image   text,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (org_id, code)
);
create index on apartments (org_id, status);
create index on apartments (property_id);

-- Seasonal / date-range rate overrides
create table apartment_rates (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations(id) on delete cascade,
  apartment_id uuid not null references apartments(id) on delete cascade,
  label        text,
  start_date   date not null,
  end_date     date not null,
  nightly_rate integer not null,
  min_nights   smallint,
  created_at   timestamptz not null default now(),
  check (end_date >= start_date)
);
create index on apartment_rates (apartment_id, start_date, end_date);

-- ---------------------------------------------------------------------
-- Guests
-- ---------------------------------------------------------------------
create table guests (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  first_name    text not null,
  last_name     text not null,
  email         text,
  phone         text,
  nationality   text,
  id_type       text,
  id_number     text,
  id_expiry     date,
  date_of_birth date,
  address       text,
  city          text,
  country       text,
  emergency_contact_name  text,
  emergency_contact_phone text,
  notes         text,
  tags          text[] not null default '{}',
  is_vip        boolean not null default false,
  is_blacklisted boolean not null default false,
  avatar_url    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index on guests (org_id);
create index on guests (org_id, last_name, first_name);
-- Fast global search
create index guests_search_idx on guests
  using gin (to_tsvector('simple',
    coalesce(first_name,'') || ' ' || coalesce(last_name,'') || ' ' ||
    coalesce(email,'') || ' ' || coalesce(phone,'')));

-- ---------------------------------------------------------------------
-- Bookings
-- ---------------------------------------------------------------------
create table bookings (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references organizations(id) on delete cascade,
  reference      text not null,
  apartment_id   uuid not null references apartments(id) on delete restrict,
  guest_id       uuid not null references guests(id) on delete restrict,
  check_in       date not null,
  check_out      date not null,
  check_in_time  time,
  check_out_time time,
  actual_check_in  timestamptz,
  actual_check_out timestamptz,
  adults         smallint not null default 1,
  children       smallint not null default 0,
  status         booking_status not null default 'pending',
  source         booking_source not null default 'direct',
  nightly_rate   integer not null default 0,
  nights         integer generated always as (check_out - check_in) stored,
  subtotal       integer not null default 0,
  cleaning_fee   integer not null default 0,
  extra_fees     integer not null default 0,
  discount       integer not null default 0,
  tax            integer not null default 0,
  total          integer not null default 0,
  commission     integer not null default 0,
  notes          text,
  internal_notes text,
  cancelled_at   timestamptz,
  cancellation_reason text,
  created_by     uuid references auth.users(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (org_id, reference),
  constraint bookings_dates_valid check (check_out > check_in)
);
create index on bookings (org_id, check_in, check_out);
create index on bookings (apartment_id, check_in, check_out);
create index on bookings (guest_id);
create index on bookings (org_id, status);

-- Overbooking prevention: no two live bookings may overlap on one apartment.
-- Cancelled / no-show bookings are excluded so the dates free up again.
alter table bookings add constraint bookings_no_overlap
  exclude using gist (
    apartment_id with =,
    daterange(check_in, check_out, '[)') with &&
  ) where (status not in ('cancelled', 'no_show'));

-- Manual calendar blocks (maintenance, owner stays, deep cleaning...)
create table calendar_blocks (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations(id) on delete cascade,
  apartment_id uuid not null references apartments(id) on delete cascade,
  start_date   date not null,
  end_date     date not null,
  reason       text not null default 'blocked',
  note         text,
  created_at   timestamptz not null default now(),
  check (end_date > start_date)
);
create index on calendar_blocks (apartment_id, start_date, end_date);

-- ---------------------------------------------------------------------
-- Invoices & payments
-- ---------------------------------------------------------------------
create table invoices (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  number      text not null,
  booking_id  uuid references bookings(id) on delete set null,
  guest_id    uuid references guests(id) on delete set null,
  apartment_id uuid references apartments(id) on delete set null,
  issue_date  date not null default current_date,
  due_date    date,
  subtotal    integer not null default 0,
  tax         integer not null default 0,
  discount    integer not null default 0,
  total       integer not null default 0,
  status      invoice_status not null default 'draft',
  notes       text,
  terms       text,
  pdf_url     text,
  voided_at   timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (org_id, number)
);
create index on invoices (org_id, issue_date);
create index on invoices (booking_id);

create table invoice_items (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  invoice_id  uuid not null references invoices(id) on delete cascade,
  description text not null,
  quantity    numeric(10,2) not null default 1,
  unit_price  integer not null default 0,
  amount      integer not null default 0,
  position    smallint not null default 0
);
create index on invoice_items (invoice_id);

create table payments (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  booking_id  uuid references bookings(id) on delete cascade,
  invoice_id  uuid references invoices(id) on delete set null,
  guest_id    uuid references guests(id) on delete set null,
  amount      integer not null,
  method      payment_method not null default 'cash',
  status      payment_status not null default 'paid',
  paid_at     timestamptz not null default now(),
  reference   text,
  note        text,
  created_at  timestamptz not null default now()
);
create index on payments (org_id, paid_at);
create index on payments (booking_id);
create index on payments (invoice_id);

-- ---------------------------------------------------------------------
-- Expenses
-- ---------------------------------------------------------------------
create table expenses (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  apartment_id  uuid references apartments(id) on delete set null,
  booking_id    uuid references bookings(id) on delete set null,
  category      expense_category not null default 'other',
  vendor        text,
  description   text,
  amount        integer not null,
  expense_date  date not null default current_date,
  method        payment_method not null default 'bank_transfer',
  status        payment_status not null default 'paid',
  invoice_ref   text,
  attachment_url text,
  is_recurring  boolean not null default false,
  recurrence    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index on expenses (org_id, expense_date);
create index on expenses (apartment_id);
create index on expenses (org_id, category);

-- ---------------------------------------------------------------------
-- Housekeeping / maintenance tasks
-- ---------------------------------------------------------------------
create table tasks (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations(id) on delete cascade,
  apartment_id uuid not null references apartments(id) on delete cascade,
  booking_id   uuid references bookings(id) on delete set null,
  type         task_type not null,
  title        text not null,
  description  text,
  status       task_status not null default 'pending',
  priority     smallint not null default 2,
  due_date     date,
  assignee     text,
  cost         integer not null default 0,
  completed_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index on tasks (org_id, status, due_date);
create index on tasks (apartment_id);

-- ---------------------------------------------------------------------
-- Documents, notes, notifications, activity
-- ---------------------------------------------------------------------
create table documents (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations(id) on delete cascade,
  entity_type  text not null,           -- 'guest' | 'apartment' | 'booking' | 'expense'
  entity_id    uuid not null,
  name         text not null,
  file_path    text not null,
  mime_type    text,
  size_bytes   bigint,
  uploaded_by  uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now()
);
create index on documents (org_id, entity_type, entity_id);

create table notes (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  entity_type text not null,
  entity_id   uuid not null,
  body        text not null,
  author_id   uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index on notes (org_id, entity_type, entity_id);

create table notifications (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references organizations(id) on delete cascade,
  user_id    uuid references auth.users(id) on delete cascade,
  type       text not null,
  title      text not null,
  body       text,
  link       text,
  severity   text not null default 'info',
  read_at    timestamptz,
  created_at timestamptz not null default now()
);
create index on notifications (org_id, user_id, read_at);

create table activity_log (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  entity_type text not null,
  entity_id   uuid not null,
  action      text not null,
  detail      jsonb not null default '{}'::jsonb,
  actor_id    uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index on activity_log (org_id, entity_type, entity_id, created_at desc);

-- ---------------------------------------------------------------------
-- Triggers: updated_at
-- ---------------------------------------------------------------------
create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array[
    'organizations','profiles','properties','apartments','guests','bookings',
    'invoices','expenses','tasks'
  ] loop
    execute format(
      'create trigger %I_set_updated_at before update on %I
       for each row execute function set_updated_at()', t, t);
  end loop;
end $$;

-- New auth user -> profile row
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------
-- Helper: the set of orgs the current user belongs to. SECURITY DEFINER so
-- the policy on `memberships` itself cannot recurse.
create or replace function auth_org_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select org_id from memberships where user_id = auth.uid();
$$;

create or replace function is_org_member(target uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from memberships
    where user_id = auth.uid() and org_id = target
  );
$$;

alter table organizations   enable row level security;
alter table profiles        enable row level security;
alter table memberships     enable row level security;
alter table properties      enable row level security;
alter table apartments      enable row level security;
alter table apartment_rates enable row level security;
alter table guests          enable row level security;
alter table bookings        enable row level security;
alter table calendar_blocks enable row level security;
alter table invoices        enable row level security;
alter table invoice_items   enable row level security;
alter table payments        enable row level security;
alter table expenses        enable row level security;
alter table tasks           enable row level security;
alter table documents       enable row level security;
alter table notes           enable row level security;
alter table notifications   enable row level security;
alter table activity_log    enable row level security;

-- Own profile only
create policy "profiles: self read"   on profiles for select using (id = auth.uid());
create policy "profiles: self write"  on profiles for update using (id = auth.uid());

-- Organizations the user is a member of
create policy "orgs: member read"  on organizations for select using (is_org_member(id));
create policy "orgs: admin write"  on organizations for update using (
  exists (select 1 from memberships m
          where m.org_id = organizations.id and m.user_id = auth.uid()
            and m.role in ('owner','admin')));

create policy "memberships: read own org" on memberships for select
  using (user_id = auth.uid() or is_org_member(org_id));

-- Every tenant table follows the same shape.
do $$
declare t text;
begin
  foreach t in array array[
    'properties','apartments','apartment_rates','guests','bookings',
    'calendar_blocks','invoices','invoice_items','payments','expenses',
    'tasks','documents','notes','notifications','activity_log'
  ] loop
    execute format($f$
      create policy "%1$s: member read" on %1$I for select
        using (is_org_member(org_id));
      create policy "%1$s: member insert" on %1$I for insert
        with check (is_org_member(org_id));
      create policy "%1$s: member update" on %1$I for update
        using (is_org_member(org_id)) with check (is_org_member(org_id));
      create policy "%1$s: member delete" on %1$I for delete
        using (is_org_member(org_id));
    $f$, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Reporting views
-- ---------------------------------------------------------------------
-- A view runs with its OWNER's privileges unless `security_invoker` is set,
-- and the owner here owns the base tables — which means row-level security
-- would be bypassed for anyone querying through the view. PostgREST exposes
-- everything in `public`, so these must run as the caller.

-- Booking balance = total invoiced minus payments received.
create or replace view booking_balances
with (security_invoker = on) as
select
  b.id                          as booking_id,
  b.org_id,
  b.total,
  coalesce(p.paid, 0)           as paid,
  b.total - coalesce(p.paid, 0) as balance
from bookings b
left join lateral (
  select sum(amount) as paid
  from payments
  where booking_id = b.id and status in ('paid', 'partial')
) p on true;

-- One row per apartment per night actually sold — the base for
-- occupancy, ADR and RevPAR without repeating date maths in the client.
create or replace view booking_nights
with (security_invoker = on) as
select
  b.org_id,
  b.id           as booking_id,
  b.apartment_id,
  b.source,
  d::date        as night,
  b.total::numeric / nullif(b.check_out - b.check_in, 0) as night_revenue
from bookings b
cross join lateral generate_series(b.check_in, b.check_out - 1, interval '1 day') d
where b.status not in ('cancelled', 'no_show');
