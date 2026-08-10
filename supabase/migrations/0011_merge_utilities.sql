-- =====================================================================
-- "Charges" folded into "Factures"
-- =====================================================================
-- Électricité, eau and internet were being recorded under two headings at
-- once — the old `utilities` category and the new `bills` one — so the same
-- cost could land in either depending on when it was entered, and no chart
-- could be trusted. There is now one place for them.
--
-- The type is left null: nothing in an old row reliably says whether it was the
-- electricity or the water, and guessing would put wrong numbers in a report
-- that looks authoritative. They show as "Factures" with no type until someone
-- opens one and says which it was.
--
-- Safe to re-run.
-- =====================================================================

update expenses
   set category = 'bills'
 where category::text = 'utilities';

-- `utilities` stays in the enum: PostgreSQL cannot drop a value from an enum
-- type, and attempting to work around that would mean rebuilding the column.
-- The application no longer offers it, so nothing new can be filed there.
