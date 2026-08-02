-- =====================================================================
-- French as the house language
-- =====================================================================
-- `organizations.locale` has existed since 0001 but nothing ever wrote to it —
-- it only fed number formatting, and defaulted to 'en'. It is now the setting
-- behind the whole interface, so the default moves to French and the companies
-- already created are switched over.
--
-- Anyone who prefers English can change it back in Settings → Language; this
-- only decides where a company starts.
--
-- Safe to re-run.
-- =====================================================================

alter table organizations alter column locale set default 'fr';

-- Existing companies were created before there was a language setting, so their
-- 'en' is the column default rather than a choice anyone made.
update organizations set locale = 'fr' where locale = 'en';
