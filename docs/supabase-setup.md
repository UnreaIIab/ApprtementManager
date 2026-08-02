# Connecting Supabase

The app runs against Supabase the moment two environment variables are present.
This guide takes a brand-new project to a working, tenant-isolated production
database.

---

## 1. Create the project

**[supabase.com/dashboard](https://supabase.com/dashboard) → New project**

| Field | Notes |
|---|---|
| Name | e.g. `atlas-stays` |
| Database password | Save it in a password manager — it can be reset but not retrieved |
| Region | **Cannot be changed later.** Pick the region closest to your staff and guests; it is the single biggest latency factor |

Provisioning takes a couple of minutes.

---

## 2. Run the migrations

**SQL Editor → New query**, then run these **in order**:

1. `supabase/migrations/0001_init.sql` — tables, enums, indexes, triggers, row-level security, reporting views
2. `supabase/migrations/0002_bootstrap.sql` — storage buckets, org-scoped storage policies, and the `bootstrap_workspace` helper
3. `supabase/migrations/0003_view_security.sql` — makes the reporting views run as the caller instead of the owner
4. `supabase/migrations/0004_multi_company.sql` — lets a signed-in user create and leave companies safely
5. `supabase/migrations/0005_lock_bootstrap.sql` — takes the admin bootstrap helper off the public API
6. `supabase/migrations/0006_public_listings.sql` — shareable apartment links
7. `supabase/migrations/0007_document_numbers.sql` — server-allocated booking, invoice and receipt numbers

All seven are safe to re-run.

`0001` is one transaction's worth of DDL; if it reports an error, nothing
downstream will work, so fix it before continuing rather than running `0002`.

---

## 3. Create your first user

**Authentication → Users → Add user** → set an email and password, and tick
*Auto Confirm User* (otherwise the account can't sign in until the email is
verified).

---

## 4. Claim the workspace

Every row in the app is scoped by `org_id`, and RLS resolves that through the
`memberships` table. A user with no membership sees an **empty** app — not an
error. This call creates the organisation and makes that user its owner:

```sql
select public.bootstrap_workspace(
  'you@example.com',      -- the user you just created
  'Your Company',
  'EUR',                  -- currency, drives every amount in the UI
  'Europe/Lisbon'         -- timezone
);
```

Re-running it is harmless — it reuses the existing organisation.

---

## 5. Wire the keys

**Project Settings → API**, then create `.env.local` in the project root:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<the anon / public key>
```

```bash
npm run build && npm run start
```

> **Only ever use the `anon` key here.** The `service_role` key bypasses
> row-level security entirely; putting it in a `NEXT_PUBLIC_*` variable ships it
> to every browser and hands anyone your whole database. The anon key is
> designed to be public — your data is protected by the RLS policies in
> `0001_init.sql`, not by keeping that key secret.

`NEXT_PUBLIC_*` values are **inlined at build time**, so set them before
`npm run build` and rebuild whenever they change.

---

## 6. Point auth at your domain

**Authentication → URL Configuration**

- Site URL: `https://your-domain.com`
- Redirect URLs: `https://your-domain.com/**`

Without this, password-reset links come back pointing at `localhost`.

---

## Verifying it worked

Signing in should give you an app with **no apartments, no bookings, no
guests** — a genuinely empty workspace. That is the correct result on a fresh
database — the app never invents placeholder records to fill the gap.

If you instead get the **"Supabase is not configured"** screen, `.env.local` is
missing or was added after the last build — these values are inlined at build
time, so rebuild.

If sign-in works but every screen is empty and stays empty, the likely cause is
a missing membership: run `bootstrap_workspace(...)` for your user. RLS
correctly hides everything from a user who belongs to no organisation.

Add your first apartment from **Apartments → Add apartment**, and confirm it
appears in the Supabase **Table Editor** under `apartments`.

---

## How tenancy is enforced

Worth understanding before you invite anyone:

- Every tenant table carries `org_id`, and its RLS policies check membership via
  a `SECURITY DEFINER` helper (`is_org_member`), so policies can't recurse.
- `bookings_no_overlap` is a GiST **exclusion constraint**: two live stays cannot
  overlap on one apartment. This is enforced by Postgres, not the UI — the
  calendar's conflict check is a convenience on top of it.
- Cancelled and no-show bookings are excluded from that constraint, so
  cancelling a stay releases its dates immediately.
- Storage objects are pathed `{org_id}/{entity}/{entity_id}/{filename}` and every
  storage policy checks org membership against that leading folder. Without it,
  any signed-in user could read another organisation's guest ID scans.

## Adding teammates

There is deliberately no client-side path to create a membership — that would
let any signed-in user join any organisation. Invite through Supabase Auth, then
grant access with SQL:

```sql
insert into memberships (org_id, user_id, role)
select
  (select id from organizations where name = 'Your Company'),
  (select id from auth.users where email = 'teammate@example.com'),
  'manager'
on conflict (org_id, user_id) do update set role = excluded.role;
```

Roles: `owner`, `admin`, `manager`, `staff`, `viewer`.

---

## Managing several companies

One account can belong to any number of companies — `memberships` is unique on
(org_id, user_id), and RLS is evaluated per organisation. Each company is a
fully separate tenant:

| | |
|---|---|
| Currency, tax rate, invoice series | per company |
| Apartments, bookings, guests, books | never shared |
| Staff | a member of one cannot see the other |
| Reports | never mixed |

Switch between them from the company menu in the top bar. **Create company**
there sets up a new one with you as its owner.

The switcher is not a filter. It changes which organisation every query and
mutation addresses, and the cache is keyed by company so switching cannot show
you the previous one's figures.

### Why creating a company goes through a function

`organizations` and `memberships` deliberately have **no INSERT policy**. A
client-side insert into `memberships` would let any signed-in user grant
themselves access to any company — the whole tenancy model would be decorative.

Creation therefore runs through `create_organization(...)`, a `SECURITY
DEFINER` function that inserts the organisation and the membership atomically
and always makes the **caller** the owner. It takes no user parameter, so it
cannot be aimed at anyone else.

`leave_organization(...)` is the counterpart, and refuses to let the last owner
orphan a company.

### If you want one company with several buildings

That is what `properties` is for — buildings grouped inside a single company,
sharing one set of books. Use companies only when the books must be separate.

---

## Sharing an apartment with a client

Open an apartment → **Share**. Turn on *Anyone with the link can view*, then copy
the link or hit **Send on WhatsApp**. The client opens it with no account and no
login.

The page shows photos, description, amenities, capacity, location and the
nightly rate — plus your company's phone and email so they can get in touch.

**Sharing is off by default**, per apartment. **New link** rotates the token,
which instantly breaks every link already sent — use it if one goes somewhere it
shouldn't have.

### How the page reads data it isn't allowed to see

An anonymous visitor cannot read the `apartments` table at all; no policy grants
them access, and that has not changed.

Instead the page calls `get_public_listing(token)`, a `SECURITY DEFINER`
function that is the single window onto that data. It returns a **fixed list of
guest-safe fields** and only for apartments explicitly marked shareable, so a
column added to `apartments` later can never be exposed by accident. Unknown,
revoked and switched-off tokens all return exactly the same nothing, so the URL
never reveals whether a listing once existed.

Photos live in the `apartment-images` bucket, which is public-read by design —
they are shown to guests. Writes stay restricted to members of the owning
company by the storage policies in `0002_bootstrap.sql`.


---

## Document numbers

Booking references, invoice numbers and payment receipt numbers are allocated by
the database, not the browser.

| | Format | Resets |
|---|---|---|
| Booking | `BK-00001` | never |
| Invoice | `INV-2026-0001` | yearly |
| Receipt | `RCT-2026-0001` | yearly |

The prefixes for bookings and invoices come from **Settings → Invoicing**.

A `before insert` trigger fills the field in whenever it is left empty, calling
`next_document_number(org, kind)`. Because that happens **inside the inserting
transaction**, the series is unique under concurrent use and gapless: if the
insert rolls back, so does the counter.

Supplying a number explicitly still works, which is what a data import needs.

Each company has its own independent series.

### Checking it yourself

The migrations can be run against a stock PostgreSQL and asserted:

```bash
createdb pmscheck
psql -d pmscheck -f supabase/tests/stub.sql
for f in supabase/migrations/*.sql; do psql -d pmscheck -v ON_ERROR_STOP=1 -f "$f"; done
psql -d pmscheck -f supabase/tests/numbering.sql
```

`supabase/tests/stub.sql` stands in for the `auth` and `storage` schemas Supabase
provides. It is test scaffolding and is never run against a real project.
