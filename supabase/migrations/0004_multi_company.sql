-- =====================================================================
-- Multi-company: let a signed-in user create additional organisations
-- =====================================================================
-- The schema already supports one user belonging to many companies —
-- `memberships` is unique on (org_id, user_id), and `is_org_member` is checked
-- per organisation. What was missing is a *safe* way to create one from the
-- app.
--
-- There is deliberately no INSERT policy on `organizations` or `memberships`:
-- a client-side insert into `memberships` would let any signed-in user grant
-- themselves access to any company. So creation goes through a SECURITY DEFINER
-- function that does both inserts atomically and always makes the *caller* the
-- owner — it takes no user parameter, so it cannot be pointed at anyone else.
-- =====================================================================

create or replace function public.create_organization(
  org_name     text,
  org_currency text default 'EUR',
  org_timezone text default 'UTC'
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  caller  uuid := auth.uid();
  new_org uuid;
  clean   text := nullif(btrim(org_name), '');
begin
  if caller is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;
  if clean is null then
    raise exception 'Company name is required' using errcode = '22023';
  end if;
  if length(clean) > 160 then
    raise exception 'Company name is too long' using errcode = '22023';
  end if;
  if length(coalesce(org_currency, '')) <> 3 then
    raise exception 'Currency must be a 3-letter code' using errcode = '22023';
  end if;

  insert into organizations (name, currency, timezone)
  values (clean, upper(org_currency), coalesce(nullif(btrim(org_timezone), ''), 'UTC'))
  returning id into new_org;

  -- The caller owns what they create. Never parameterised.
  insert into memberships (org_id, user_id, role)
  values (new_org, caller, 'owner');

  insert into properties (org_id, name)
  values (new_org, clean || ' Portfolio');

  return new_org;
end;
$$;

-- Only signed-in users, and never the anonymous role.
revoke all on function public.create_organization(text, text, text) from public, anon;
grant execute on function public.create_organization(text, text, text) to authenticated;

-- ---------------------------------------------------------------------
-- Leaving a company
-- ---------------------------------------------------------------------
-- Deleting your own membership is safe (it only ever removes your own access),
-- but the last owner must not be able to orphan a company.
create or replace function public.leave_organization(target_org uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller       uuid := auth.uid();
  caller_role  member_role;
  other_owners integer;
begin
  if caller is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  select role into caller_role
  from memberships where org_id = target_org and user_id = caller;

  if caller_role is null then
    raise exception 'You are not a member of that company' using errcode = '42501';
  end if;

  if caller_role = 'owner' then
    select count(*) into other_owners
    from memberships
    where org_id = target_org and role = 'owner' and user_id <> caller;

    if other_owners = 0 then
      raise exception 'Promote another owner before leaving this company'
        using errcode = '23503';
    end if;
  end if;

  delete from memberships where org_id = target_org and user_id = caller;
end;
$$;

revoke all on function public.leave_organization(uuid) from public, anon;
grant execute on function public.leave_organization(uuid) to authenticated;
