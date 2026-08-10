-- =====================================================================
-- Bills as an expense category, with a type and a scanned document
-- =====================================================================
-- "Facture" covers several unrelated things a landlord pays — electricity,
-- water, internet, the syndic, tax — and lumping them under one category loses
-- exactly the distinction you need when a bill looks wrong. `bill_type` keeps
-- the breakdown without inventing five more top-level categories that would
-- crowd every chart legend.
--
-- Safe to re-run.
-- =====================================================================

-- ---------------------------------------------------------------------
-- The category
-- ---------------------------------------------------------------------
alter type expense_category add value if not exists 'bills';

-- ---------------------------------------------------------------------
-- The type of bill
-- ---------------------------------------------------------------------
-- Deliberately `text` with a check rather than a second enum: a new kind of
-- bill is then one migration touching one constraint, instead of an ALTER TYPE
-- whose new value cannot be used in the transaction that adds it.
alter table expenses add column if not exists bill_type text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'expenses_bill_type_valid'
  ) then
    alter table expenses add constraint expenses_bill_type_valid check (
      bill_type is null
      or bill_type in ('electricity', 'water', 'internet', 'syndic', 'tax')
    );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'expenses_bill_type_scope'
  ) then
    /*
     * A bill type only means something on a bill.
     *
     * `category::text` rather than the enum literal is intentional: the value
     * added above cannot be referenced in the same transaction that adds it,
     * and comparing as text sidesteps that entirely — so this file works in one
     * pass whether or not the SQL editor wraps it in a transaction.
     */
    alter table expenses add constraint expenses_bill_type_scope check (
      bill_type is null or category::text = 'bills'
    );
  end if;
end $$;

create index if not exists expenses_bill_type_idx
  on expenses (org_id, bill_type)
  where bill_type is not null;
