-- Notification generation: fires, deduplicates, respects settings, resolves.
\set ON_ERROR_STOP on

insert into auth.users (id, email) values
  ('11111111-0000-0000-0000-000000000001', 'owner@example.com');
select public.bootstrap_workspace('owner@example.com','Zakar','MAD','Africa/Casablanca') as org \gset

insert into apartments (org_id, code, name, capacity, nightly_rate)
values (:'org', 'A-001', 'Diar Salam', 4, 60000);
insert into guests (org_id, first_name, last_name) values (:'org', 'Karim', 'Bouzar');

-- A guest still in-house on their departure day: the reported case.
insert into bookings (org_id, apartment_id, guest_id, check_in, check_out, total, status)
values (:'org', (select id from apartments where code='A-001'),
        (select id from guests where last_name='Bouzar'),
        current_date - 17, current_date, 102000, 'checked_in');

do $$
declare n integer;
begin
  n := public.generate_notifications();
  if n < 1 then raise exception 'CHECK FAILED: nothing generated (got %)', n; end if;
  if not exists (select 1 from notifications where type = 'upcoming_check_out') then
    raise exception 'CHECK FAILED: no check-out notification';
  end if;
  raise notice 'ok: the missed check-out produced a notification';
end $$;

-- 2. Running again must not duplicate it.
do $$
declare before_n integer; after_n integer; made integer;
begin
  select count(*) into before_n from notifications;
  made := public.generate_notifications();
  select count(*) into after_n from notifications;
  if after_n <> before_n then
    raise exception 'CHECK FAILED: rerun added % rows', after_n - before_n;
  end if;
  if made <> 0 then raise exception 'CHECK FAILED: rerun claimed % new', made; end if;
  raise notice 'ok: rerunning the scan is a no-op (dedupe holds)';
end $$;

-- 3. Recording the departure clears it.
do $$
begin
  update bookings set status = 'checked_out'
  where org_id = (select id from organizations where name='Zakar');
  if exists (select 1 from notifications where dedupe_key like 'checkout:%') then
    raise exception 'CHECK FAILED: alert survived the check-out';
  end if;
  raise notice 'ok: recording the departure removes the alert';
end $$;

-- 4. A disabled rule stays silent.
do $$
declare made integer;
begin
  update bookings set status = 'checked_in';
  update organizations
     set settings = jsonb_build_object('notifications',
           jsonb_build_object('upcoming_check_out', false));
  made := public.generate_notifications();
  if exists (select 1 from notifications where type = 'upcoming_check_out') then
    raise exception 'CHECK FAILED: switched-off rule still fired';
  end if;
  raise notice 'ok: a rule switched off in Settings produces nothing';
end $$;

-- 5. Switching it back on resumes.
do $$
begin
  update organizations set settings = '{}'::jsonb;
  perform public.generate_notifications();
  if not exists (select 1 from notifications where type = 'upcoming_check_out') then
    raise exception 'CHECK FAILED: rule did not resume when re-enabled';
  end if;
  raise notice 'ok: switching it back on resumes generation';
end $$;

-- 6. An overdue invoice is caught, and paying it clears the alert.
do $$
begin
  insert into invoices (org_id, issue_date, due_date, total, status)
  values ((select id from organizations where name='Zakar'),
          current_date - 30, current_date - 10, 50000, 'sent');
  perform public.generate_notifications();
  if not exists (select 1 from notifications where type = 'invoice_due') then
    raise exception 'CHECK FAILED: overdue invoice produced nothing';
  end if;
  update invoices set status = 'paid';
  if exists (select 1 from notifications where dedupe_key like 'invoice:%') then
    raise exception 'CHECK FAILED: alert survived payment';
  end if;
  raise notice 'ok: overdue invoice alerts, and paying it clears the alert';
end $$;

-- 7. A cancelled booking is not chased.
do $$
begin
  delete from notifications;
  update bookings set status = 'cancelled';
  perform public.generate_notifications();
  if exists (select 1 from notifications) then
    raise exception 'CHECK FAILED: a cancelled booking produced %',
      (select string_agg(type, ', ') from notifications);
  end if;
  raise notice 'ok: cancelled bookings are left alone';
end $$;

select 'ALL NOTIFICATION CHECKS PASSED' as result;
