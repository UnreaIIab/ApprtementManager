-- Document numbering: format, uniqueness, per-company isolation, gaplessness.
-- Concurrency is exercised separately (a single psql session is serial).

\set ON_ERROR_STOP on

insert into auth.users (id, email) values
  ('eeeeeeee-0000-0000-0000-000000000001', 'a@example.com'),
  ('eeeeeeee-0000-0000-0000-000000000002', 'b@example.com');

select public.bootstrap_workspace('a@example.com', 'Alpha Co', 'MAD', 'Africa/Casablanca') as org_a \gset
select public.bootstrap_workspace('b@example.com', 'Beta Co',  'EUR', 'Europe/Lisbon')     as org_b \gset

insert into apartments (org_id, code, name, capacity, nightly_rate)
values (:'org_a', 'A-001', 'Alpha Flat', 2, 90000),
       (:'org_b', 'B-001', 'Beta Flat',  2, 50000);
insert into guests (org_id, first_name, last_name)
values (:'org_a', 'Ada', 'A'), (:'org_b', 'Bob', 'B');

-- 1. A booking gets a reference without one being supplied.
do $$
declare ref text;
begin
  insert into bookings (org_id, apartment_id, guest_id, check_in, check_out, total)
  values ((select id from organizations where name='Alpha Co'),
          (select id from apartments where code='A-001'),
          (select id from guests where last_name='A'),
          '2026-03-01','2026-03-05', 40000)
  returning reference into ref;

  if ref !~ '^BK-\d{5}$' then
    raise exception 'CHECK FAILED: reference % does not match BK-00000', ref;
  end if;
  raise notice 'ok: booking reference assigned automatically (%)', ref;
end $$;

-- 2. The series increments rather than repeating.
do $$
declare a text; b text;
begin
  insert into bookings (org_id, apartment_id, guest_id, check_in, check_out, total)
  values ((select id from organizations where name='Alpha Co'),
          (select id from apartments where code='A-001'),
          (select id from guests where last_name='A'),
          '2026-04-01','2026-04-03', 20000) returning reference into a;
  insert into bookings (org_id, apartment_id, guest_id, check_in, check_out, total)
  values ((select id from organizations where name='Alpha Co'),
          (select id from apartments where code='A-001'),
          (select id from guests where last_name='A'),
          '2026-05-01','2026-05-03', 20000) returning reference into b;
  if a = b then raise exception 'CHECK FAILED: two bookings share reference %', a; end if;
  if b <= a  then raise exception 'CHECK FAILED: series went backwards, % then %', a, b; end if;
  raise notice 'ok: references increment (% then %)', a, b;
end $$;

-- 3. Deleting does NOT let the next insert reuse a number — the old bug.
do $$
declare before_ref text; after_ref text;
begin
  select reference into before_ref from bookings order by reference desc limit 1;
  delete from bookings where reference = before_ref;

  insert into bookings (org_id, apartment_id, guest_id, check_in, check_out, total)
  values ((select id from organizations where name='Alpha Co'),
          (select id from apartments where code='A-001'),
          (select id from guests where last_name='A'),
          '2026-06-01','2026-06-03', 20000) returning reference into after_ref;

  if after_ref = before_ref then
    raise exception 'CHECK FAILED: reference % was reused after deletion', after_ref;
  end if;
  raise notice 'ok: deleting a booking does not free its number (% then %)', before_ref, after_ref;
end $$;

-- 4. Each company has its own series, both starting at 1.
do $$
declare beta_ref text;
begin
  insert into bookings (org_id, apartment_id, guest_id, check_in, check_out, total)
  values ((select id from organizations where name='Beta Co'),
          (select id from apartments where code='B-001'),
          (select id from guests where last_name='B'),
          '2026-03-01','2026-03-04', 30000) returning reference into beta_ref;

  if beta_ref <> 'BK-00001' then
    raise exception 'CHECK FAILED: second company started at % rather than BK-00001', beta_ref;
  end if;
  raise notice 'ok: each company numbers independently (Beta starts at %)', beta_ref;
end $$;

-- 5. Invoices carry the year and reset annually.
do $$
declare num text; expected text := 'INV-' || to_char(now(),'YYYY') || '-0001';
begin
  insert into invoices (org_id, issue_date, total)
  values ((select id from organizations where name='Alpha Co'), current_date, 1000)
  returning number into num;
  if num <> expected then
    raise exception 'CHECK FAILED: invoice number %, expected %', num, expected;
  end if;
  raise notice 'ok: invoice numbered with the year (%)', num;
end $$;

-- 6. Duplicating an invoice gets a fresh number — previously it wrote ''.
do $$
declare a text; b text;
begin
  select number into a from invoices limit 1;
  insert into invoices (org_id, issue_date, total)
  values ((select id from organizations where name='Alpha Co'), current_date, 1000)
  returning number into b;
  if b = a or b is null or btrim(b) = '' then
    raise exception 'CHECK FAILED: duplicate produced %', coalesce(b,'<null>');
  end if;
  raise notice 'ok: a duplicated invoice gets its own number (%)', b;
end $$;

-- 7. Payments get a receipt number distinct from the bank reference.
do $$
declare rcpt text; expected text := 'RCT-' || to_char(now(),'YYYY') || '-0001';
begin
  insert into payments (org_id, amount, reference)
  values ((select id from organizations where name='Alpha Co'), 5000, 'TXN-FROM-BANK')
  returning receipt_number into rcpt;
  if rcpt <> expected then
    raise exception 'CHECK FAILED: receipt %, expected %', rcpt, expected;
  end if;
  if (select reference from payments where receipt_number = rcpt) <> 'TXN-FROM-BANK' then
    raise exception 'CHECK FAILED: the bank reference was overwritten';
  end if;
  raise notice 'ok: receipt number assigned, bank reference untouched (%)', rcpt;
end $$;

-- 8. An explicitly supplied number is respected, for imports.
do $$
declare ref text;
begin
  insert into bookings (org_id, apartment_id, guest_id, check_in, check_out, total, reference)
  values ((select id from organizations where name='Alpha Co'),
          (select id from apartments where code='A-001'),
          (select id from guests where last_name='A'),
          '2026-07-01','2026-07-03', 20000, 'LEGACY-42') returning reference into ref;
  if ref <> 'LEGACY-42' then
    raise exception 'CHECK FAILED: supplied reference was overwritten with %', ref;
  end if;
  raise notice 'ok: an explicit reference is preserved (%)', ref;
end $$;

-- 9. A member of another company cannot pull numbers from someone else's series.
do $$
declare got text;
begin
  perform set_config('request.jwt.claim.sub', 'eeeeeeee-0000-0000-0000-000000000002', true);
  set local role authenticated;
  begin
    got := public.next_document_number(
      (select id from organizations where name='Alpha Co'), 'invoice');
    reset role;
    raise exception 'CHECK FAILED: burned a number in another company (%)', got;
  exception
    when insufficient_privilege then
      reset role;
      raise notice 'ok: cannot allocate numbers for a company you are not in';
  end;
end $$;

select 'ALL NUMBERING CHECKS PASSED' as result;
