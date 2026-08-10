-- Bills: the category exists, the type is constrained, and it only applies to bills.
\set ON_ERROR_STOP on

insert into auth.users (id, email) values ('22222222-0000-0000-0000-000000000001','o@e.com');
select public.bootstrap_workspace('o@e.com','Zakar','MAD','Africa/Casablanca') as org \gset

do $$
declare oid uuid := (select id from organizations where name='Zakar');
begin
  -- 1. A bill with a type is accepted.
  insert into expenses (org_id, category, bill_type, amount, expense_date)
  values (oid, 'bills', 'electricity', 27500, current_date);
  raise notice 'ok: a bill with a type is accepted';

  -- 2. Every listed type is accepted.
  insert into expenses (org_id, category, bill_type, amount, expense_date)
  select oid, 'bills', t, 1000, current_date
  from unnest(array['water','internet','syndic','tax']) as t;
  raise notice 'ok: water, internet, syndic and tax are all accepted';

  -- 3. An unlisted type is rejected.
  begin
    insert into expenses (org_id, category, bill_type, amount, expense_date)
    values (oid, 'bills', 'gas', 1000, current_date);
    raise exception 'CHECK FAILED: an unlisted bill type was accepted';
  exception when check_violation then
    raise notice 'ok: an unlisted bill type is rejected';
  end;

  -- 4. A type on a non-bill is rejected.
  begin
    insert into expenses (org_id, category, bill_type, amount, expense_date)
    values (oid, 'cleaning', 'water', 1000, current_date);
    raise exception 'CHECK FAILED: a bill type was accepted on a cleaning expense';
  exception when check_violation then
    raise notice 'ok: a bill type is rejected outside the bills category';
  end;

  -- 5. Other categories still work untouched.
  insert into expenses (org_id, category, amount, expense_date)
  values (oid, 'cleaning', 18000, current_date);
  raise notice 'ok: other categories are unaffected';
end $$;

select 'ALL BILL CHECKS PASSED' as result;
