-- =====================================================================
-- Close the reporting-view RLS bypass
-- =====================================================================
-- `booking_balances` and `booking_nights` were created as plain views. In
-- Postgres a view executes with the privileges of its OWNER unless
-- `security_invoker` is set — and the owner here is `postgres`, which is the
-- table owner and therefore bypasses row-level security entirely.
--
-- Because PostgREST exposes everything in `public`, that combination means any
-- caller holding the anon key could read every organisation's bookings through
-- the views, even though the same query against `bookings` is correctly denied.
-- On an empty database this is invisible: the views return `[]` because there
-- are no rows, not because the caller was refused.
--
-- `security_invoker = on` makes the view run as the *calling* user, so the base
-- tables' policies apply normally.
--
-- Requires PostgreSQL 15+. Supabase projects are 15 or newer; the guard below
-- degrades safely rather than failing the migration on anything older.
-- =====================================================================

do $$
declare
  v text;
begin
  if current_setting('server_version_num')::int >= 150000 then
    foreach v in array array['booking_balances', 'booking_nights'] loop
      execute format('alter view public.%I set (security_invoker = on)', v);
      raise notice 'security_invoker enabled on %', v;
    end loop;
  else
    -- No security_invoker before 15: take the views out of the API surface
    -- entirely rather than leave a bypass in place.
    revoke all on public.booking_balances from anon, authenticated;
    revoke all on public.booking_nights   from anon, authenticated;
    raise notice 'PostgreSQL < 15: revoked API access to the reporting views instead';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Verify
-- ---------------------------------------------------------------------
-- Should report `security_invoker=on` for both views on PG 15+:
--
--   select c.relname, c.reloptions
--   from pg_class c
--   join pg_namespace n on n.oid = c.relnamespace
--   where n.nspname = 'public'
--     and c.relname in ('booking_balances', 'booking_nights');
