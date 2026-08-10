-- =====================================================================
-- Notifications that exist when nobody is looking
-- =====================================================================
-- The `notifications` table has been read by the bell since 0001 and written
-- by nothing, so it was always empty. The app can now derive alerts in the
-- browser, which covers "I am looking at the screen" — this covers the rest:
-- a record that persists, can be marked read, and can later be emailed.
--
-- Two mechanisms, because the conditions are of two kinds:
--
--   * most are time-based — "the departure date has passed and nobody recorded
--     it" is not an event, it is a state that becomes true while the app is
--     closed. Those need a scheduled scan.
--   * one is event-based — an apartment returning to `available` — and that is
--     a trigger.
--
-- Safe to re-run.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Deduplication
-- ---------------------------------------------------------------------
-- A scan that runs hourly must not produce a new row every hour for the same
-- unpaid invoice. `dedupe_key` names the *condition*, not the occurrence, and
-- the unique index is what makes the whole job idempotent.
--
-- The key format matches the ids the browser derives (`checkout:<uuid>`), so
-- the client can recognise a stored row as the same condition it is already
-- showing and avoid displaying it twice.
alter table notifications add column if not exists dedupe_key text;

create unique index if not exists notifications_dedupe
  on notifications (org_id, dedupe_key)
  where dedupe_key is not null;

-- ---------------------------------------------------------------------
-- Is a rule switched on for this company?
-- ---------------------------------------------------------------------
-- Absent means on: a company that has never opened Settings should still be
-- told when a guest fails to check out. Only an explicit `false` silences.
create or replace function public.notification_rule_enabled(
  settings jsonb,
  rule text
) returns boolean
language sql immutable as $$
  select coalesce((settings -> 'notifications' ->> rule)::boolean, true);
$$;

-- ---------------------------------------------------------------------
-- The scan
-- ---------------------------------------------------------------------
create or replace function public.generate_notifications()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  created integer := 0;
begin
  /*
   * Every insert below is `on conflict do nothing` against the dedupe index,
   * so running this twice in a minute is a no-op and running it after a gap
   * catches up. The count returned is rows actually created.
   */

  -- Arrivals expected today or tomorrow, nobody checked in yet.
  with candidates as (
    insert into notifications (org_id, type, title, body, link, severity, dedupe_key)
    select
      b.org_id,
      'upcoming_check_in',
      'Arrivée prévue',
      concat_ws(' · ', g.first_name || ' ' || g.last_name, a.name, b.reference),
      '/bookings?booking=' || b.id,
      'info',
      'checkin-soon:' || b.id
    from bookings b
    join organizations o on o.id = b.org_id
    join guests g on g.id = b.guest_id
    join apartments a on a.id = b.apartment_id
    where b.status in ('pending', 'confirmed')
      and b.check_in between current_date and current_date + 1
      and notification_rule_enabled(o.settings, 'upcoming_check_in')
    on conflict (org_id, dedupe_key) where dedupe_key is not null do nothing
    returning 1
  )
  select created + count(*) into created from candidates;

  -- Departure due today and the guest is still marked in-house.
  with candidates as (
    insert into notifications (org_id, type, title, body, link, severity, dedupe_key)
    select
      b.org_id,
      'upcoming_check_out',
      'Départ à enregistrer',
      concat_ws(' · ', g.first_name || ' ' || g.last_name, a.name, b.reference),
      '/bookings?booking=' || b.id,
      case when b.check_out < current_date then 'critical' else 'warning' end,
      'checkout:' || b.id
    from bookings b
    join organizations o on o.id = b.org_id
    join guests g on g.id = b.guest_id
    join apartments a on a.id = b.apartment_id
    where b.status = 'checked_in'
      and b.check_out <= current_date
      and notification_rule_enabled(o.settings, 'upcoming_check_out')
    on conflict (org_id, dedupe_key) where dedupe_key is not null do nothing
    returning 1
  )
  select created + count(*) into created from candidates;

  -- Guest has gone and still owes money.
  with candidates as (
    insert into notifications (org_id, type, title, body, link, severity, dedupe_key)
    select
      b.org_id,
      'late_payment',
      'Solde impayé après le séjour',
      concat_ws(' · ', g.first_name || ' ' || g.last_name, a.name, b.reference),
      '/bookings?booking=' || b.id,
      'warning',
      'balance:' || b.id
    from bookings b
    join organizations o on o.id = b.org_id
    join guests g on g.id = b.guest_id
    join apartments a on a.id = b.apartment_id
    left join (
      select booking_id, sum(amount) as paid
      from payments
      where status in ('paid', 'partial')
      group by booking_id
    ) p on p.booking_id = b.id
    where b.status not in ('cancelled', 'no_show')
      and b.check_out < current_date
      and b.total - coalesce(p.paid, 0) > 0
      and notification_rule_enabled(o.settings, 'late_payment')
    on conflict (org_id, dedupe_key) where dedupe_key is not null do nothing
    returning 1
  )
  select created + count(*) into created from candidates;

  -- An invoice falling due within three days, or already overdue.
  with candidates as (
    insert into notifications (org_id, type, title, body, link, severity, dedupe_key)
    select
      i.org_id,
      'invoice_due',
      case when i.due_date < current_date then 'Facture en retard' else 'Facture à échéance' end,
      concat_ws(' · ', i.number, g.first_name || ' ' || g.last_name),
      '/invoices?invoice=' || i.id,
      case when i.due_date < current_date then 'critical' else 'warning' end,
      'invoice:' || i.id
    from invoices i
    join organizations o on o.id = i.org_id
    left join guests g on g.id = i.guest_id
    where i.status not in ('paid', 'void')
      and i.due_date is not null
      and i.due_date <= current_date + 3
      and notification_rule_enabled(o.settings, 'invoice_due')
    on conflict (org_id, dedupe_key) where dedupe_key is not null do nothing
    returning 1
  )
  select created + count(*) into created from candidates;

  -- Housekeeping and maintenance falling due.
  with candidates as (
    insert into notifications (org_id, type, title, body, link, severity, dedupe_key)
    select
      t.org_id,
      t.type::text || '_reminder',
      case when t.type = 'cleaning' then 'Ménage à faire' else 'Maintenance à faire' end,
      concat_ws(' · ', t.title, a.name),
      '/apartments/' || t.apartment_id,
      case when t.due_date < current_date then 'critical' else 'info' end,
      'task:' || t.id
    from tasks t
    join organizations o on o.id = t.org_id
    join apartments a on a.id = t.apartment_id
    where t.status in ('pending', 'in_progress')
      and t.due_date is not null
      and t.due_date <= current_date + 1
      and notification_rule_enabled(
            o.settings,
            case when t.type = 'cleaning' then 'cleaning_reminder' else 'maintenance_reminder' end)
    on conflict (org_id, dedupe_key) where dedupe_key is not null do nothing
    returning 1
  )
  select created + count(*) into created from candidates;

  return created;
end;
$$;

revoke all on function public.generate_notifications() from public, anon;
grant execute on function public.generate_notifications() to authenticated;

-- ---------------------------------------------------------------------
-- Clear a notification once its condition is gone
-- ---------------------------------------------------------------------
-- Without this a departure recorded on Monday leaves its alert sitting in the
-- bell for ever. The row is deleted rather than marked read: it was never a
-- message, it was a standing description of unfinished work.
create or replace function public.resolve_booking_notifications() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status <> 'checked_in' or new.status is distinct from old.status then
    delete from notifications
    where org_id = new.org_id and dedupe_key = 'checkout:' || new.id
      and new.status <> 'checked_in';
  end if;

  if new.status in ('cancelled', 'no_show') then
    delete from notifications
    where org_id = new.org_id
      and dedupe_key in ('checkout:' || new.id, 'checkin-soon:' || new.id, 'balance:' || new.id);
  end if;

  if new.status = 'checked_in' then
    delete from notifications
    where org_id = new.org_id and dedupe_key = 'checkin-soon:' || new.id;
  end if;

  return new;
end;
$$;

drop trigger if exists bookings_resolve_notifications on bookings;
create trigger bookings_resolve_notifications
  after update of status on bookings
  for each row execute function public.resolve_booking_notifications();

create or replace function public.resolve_invoice_notifications() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status in ('paid', 'void') then
    delete from notifications
    where org_id = new.org_id and dedupe_key = 'invoice:' || new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists invoices_resolve_notifications on invoices;
create trigger invoices_resolve_notifications
  after update of status on invoices
  for each row execute function public.resolve_invoice_notifications();

-- ---------------------------------------------------------------------
-- Schedule
-- ---------------------------------------------------------------------
-- pg_cron ships with Supabase but is not enabled by default.
--
-- Scheduling is deliberately the only optional part of this file, and it is
-- wrapped so that a missing extension cannot abort the migration. Everything
-- above — the dedupe index, the scan, the resolving triggers — is what makes
-- notifications work; the schedule only decides how often the scan runs. If it
-- is skipped you get a warning here, and the app still shows live alerts.
--
-- To enable: Database → Extensions → pg_cron, then re-run this file.
do $outer$
begin
  create extension if not exists pg_cron;

  -- Re-running must not stack duplicate schedules.
  if exists (select 1 from cron.job where jobname = 'generate-notifications') then
    perform cron.unschedule('generate-notifications');
  end if;

  -- Hourly. Every condition is day-grained, so this is about being timely on
  -- the morning of, not about precision.
  perform cron.schedule(
    'generate-notifications',
    '0 * * * *',
    $job$ select public.generate_notifications(); $job$
  );
  raise notice 'Notifications scheduled hourly.';
exception
  when others then
    raise warning
      'pg_cron unavailable (%), so notifications will not be generated on a schedule. Enable it under Database -> Extensions and re-run this file.',
      sqlerrm;
end $outer$;

-- Populate straight away rather than waiting for the first tick.
select public.generate_notifications();
