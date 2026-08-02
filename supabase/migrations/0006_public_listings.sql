-- =====================================================================
-- Shareable apartment listings
-- =====================================================================
-- Lets a manager send a client a link (WhatsApp, email) that opens a page
-- showing an apartment's photos, details and location — with no login.
--
-- Sharing is OFF by default and enabled per apartment. Each apartment carries
-- an unguessable token; rotating it revokes every link previously sent.
--
-- Safe to re-run.
-- =====================================================================

alter table apartments
  add column if not exists is_public    boolean not null default false,
  add column if not exists share_token  text,
  add column if not exists latitude     numeric(9,6),
  add column if not exists longitude    numeric(9,6);

-- Backfill before the NOT NULL, so existing rows get a token too.
update apartments
   set share_token = encode(gen_random_bytes(9), 'hex')
 where share_token is null;

alter table apartments
  alter column share_token set default encode(gen_random_bytes(9), 'hex');
alter table apartments
  alter column share_token set not null;

create unique index if not exists apartments_share_token_key
  on apartments (share_token);

-- ---------------------------------------------------------------------
-- The public read surface
-- ---------------------------------------------------------------------
/*
 * Anonymous visitors must be able to read a shared apartment, but the
 * `apartments` table itself stays completely private — no anon policy is added
 * to it.
 *
 * Instead this function is the single, fixed window onto that data. It is
 * SECURITY DEFINER, so it can see past row-level security, but it:
 *
 *   * returns an explicit list of guest-safe fields, so a column added to
 *     `apartments` later is never exposed by accident;
 *   * returns nothing unless the apartment is explicitly marked `is_public`;
 *   * is keyed on an unguessable token rather than the apartment's id.
 *
 * That last point is what makes revocation possible: rotating the token
 * invalidates every link already sent without touching the apartment.
 */
create or replace function public.get_public_listing(token text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'name',          a.name,
    'description',   a.description,
    'address',       a.address,
    'city',          a.city,
    'country',       a.country,
    'latitude',      a.latitude,
    'longitude',     a.longitude,
    'bedrooms',      a.bedrooms,
    'bathrooms',     a.bathrooms,
    'beds',          a.beds,
    'capacity',      a.capacity,
    'size_sqm',      a.size_sqm,
    'amenities',     a.amenities,
    'images',        a.images,
    'cover_image',   a.cover_image,
    'nightly_rate',  a.nightly_rate,
    'cleaning_fee',  a.cleaning_fee,
    'min_nights',    a.min_nights,
    'currency',      o.currency,
    'company',       o.name,
    'company_email', o.email,
    'company_phone', o.phone
  )
  from apartments a
  join organizations o on o.id = a.org_id
  where a.share_token = token
    and a.is_public = true
    and a.is_active = true;
$$;

revoke all on function public.get_public_listing(text) from public;
grant execute on function public.get_public_listing(text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- Verify
-- ---------------------------------------------------------------------
-- Should return null (nothing shared yet), never an error:
--   select public.get_public_listing('does-not-exist');
