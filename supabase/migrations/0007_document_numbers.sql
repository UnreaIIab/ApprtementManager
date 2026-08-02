-- =====================================================================
-- Server-allocated document numbers
-- =====================================================================
-- Booking references and invoice numbers were built in the browser from the
-- length of the loaded list. That is wrong three ways:
--
--   * the client only ever holds an 18-month window, so once older rows fall
--     out of it the count drops and numbers get REUSED;
--   * two people creating a record at the same moment compute the same number,
--     and one insert dies on the unique index;
--   * deleting a record makes the next one reuse its number.
--
-- Numbers are now allocated by the database inside the inserting transaction,
-- so they are unique and race-free by construction, and the application never
-- has to guess.
--
-- Safe to re-run.
-- =====================================================================

create table if not exists document_counters (
  org_id     uuid not null references organizations(id) on delete cascade,
  kind       text not null,               -- 'booking' | 'invoice' | 'payment'
  period     text not null default '',    -- '' = never resets, 'YYYY' = yearly
  last_value bigint not null default 0,
  primary key (org_id, kind, period)
);

/*
 * RLS on with no policy is deliberate here.
 *
 * Everywhere else in this schema that combination would be a bug — it makes a
 * table permanently invisible. This table is only ever touched by the
 * SECURITY DEFINER function below, which is what keeps a client from handing
 * itself a number that is already in use.
 */
alter table document_counters enable row level security;

-- ---------------------------------------------------------------------
-- Allocation
-- ---------------------------------------------------------------------
create or replace function public.next_document_number(target_org uuid, doc_kind text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  period_key text;
  prefix     text;
  seq        bigint;
begin
  /*
   * Guard direct RPC calls, so a signed-in user cannot burn numbers out of
   * another company's series.
   *
   * `auth.uid()` is null only for a privileged session — the SQL editor, a
   * service-role job, a data import — which already has unrestricted access, so
   * demanding membership there would block legitimate admin work (and did:
   * every manual insert failed) while adding no protection. For anyone
   * authenticated the check applies in full, and RLS independently governs
   * whether the row itself may be written.
   */
  if auth.uid() is not null and not public.is_org_member(target_org) then
    raise exception 'Not a member of that company' using errcode = '42501';
  end if;

  select
    case doc_kind
      -- Accounting expects invoice and receipt series to restart each year;
      -- a booking reference is just an identifier and runs continuously.
      when 'invoice' then to_char(now(), 'YYYY')
      when 'payment' then to_char(now(), 'YYYY')
      else ''
    end,
    case doc_kind
      when 'invoice' then coalesce(nullif(btrim(o.invoice_prefix), ''), 'INV')
      when 'booking' then coalesce(nullif(btrim(o.booking_prefix), ''), 'BK')
      when 'payment' then 'RCT'
      else upper(doc_kind)
    end
  into period_key, prefix
  from organizations o
  where o.id = target_org;

  if prefix is null then
    raise exception 'Unknown company %', target_org using errcode = '23503';
  end if;

  -- Atomic: the upsert takes a row lock, so concurrent callers queue rather
  -- than both reading the same value.
  insert into document_counters (org_id, kind, period, last_value)
  values (target_org, doc_kind, period_key, 1)
  on conflict (org_id, kind, period)
  do update set last_value = document_counters.last_value + 1
  returning last_value into seq;

  return case
    when period_key = '' then prefix || '-' || lpad(seq::text, 5, '0')
    else prefix || '-' || period_key || '-' || lpad(seq::text, 4, '0')
  end;
end;
$$;

revoke all on function public.next_document_number(uuid, text) from public, anon;
grant execute on function public.next_document_number(uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- Receipt numbers for payments
-- ---------------------------------------------------------------------
-- `reference` is whatever the bank or card terminal called the transaction.
-- A receipt number is ours, and needs its own sequence.
alter table payments add column if not exists receipt_number text;

create unique index if not exists payments_receipt_number_key
  on payments (org_id, receipt_number)
  where receipt_number is not null;

-- ---------------------------------------------------------------------
-- Assign on insert
-- ---------------------------------------------------------------------
-- Running inside the inserting transaction is what makes the series gapless:
-- if the insert rolls back, so does the counter.
create or replace function public.assign_booking_reference() returns trigger
language plpgsql as $$
begin
  if new.reference is null or btrim(new.reference) = '' then
    new.reference := public.next_document_number(new.org_id, 'booking');
  end if;
  return new;
end;
$$;

create or replace function public.assign_invoice_number() returns trigger
language plpgsql as $$
begin
  if new.number is null or btrim(new.number) = '' then
    new.number := public.next_document_number(new.org_id, 'invoice');
  end if;
  return new;
end;
$$;

create or replace function public.assign_receipt_number() returns trigger
language plpgsql as $$
begin
  if new.receipt_number is null or btrim(new.receipt_number) = '' then
    new.receipt_number := public.next_document_number(new.org_id, 'payment');
  end if;
  return new;
end;
$$;

drop trigger if exists bookings_assign_reference on bookings;
create trigger bookings_assign_reference
  before insert on bookings
  for each row execute function public.assign_booking_reference();

drop trigger if exists invoices_assign_number on invoices;
create trigger invoices_assign_number
  before insert on invoices
  for each row execute function public.assign_invoice_number();

drop trigger if exists payments_assign_receipt on payments;
create trigger payments_assign_receipt
  before insert on payments
  for each row execute function public.assign_receipt_number();

-- ---------------------------------------------------------------------
-- Seed counters past anything already numbered
-- ---------------------------------------------------------------------
-- Without this, the first server-allocated number on a database that already
-- holds records would collide with one of them.
insert into document_counters (org_id, kind, period, last_value)
select org_id, 'booking', '',
       max(coalesce(nullif(regexp_replace(reference, '\D', '', 'g'), '')::bigint, 0))
from bookings
group by org_id
on conflict (org_id, kind, period) do update
  set last_value = greatest(document_counters.last_value, excluded.last_value);

insert into document_counters (org_id, kind, period, last_value)
select org_id, 'invoice', to_char(now(), 'YYYY'),
       max(coalesce(nullif(regexp_replace(number, '\D', '', 'g'), '')::bigint, 0))
from invoices
group by org_id
on conflict (org_id, kind, period) do update
  set last_value = greatest(document_counters.last_value, excluded.last_value);
