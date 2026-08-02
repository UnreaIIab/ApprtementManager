# Atlas Stays — Apartment Rental Management System

A property management system for serviced apartments and short-term rentals:
reservations, a drag-and-drop availability calendar, guests, invoicing,
payments, expenses and reporting.

Built with Next.js 16, TypeScript, Tailwind 4 and Supabase.

---

## Quick start

```bash
npm install
cp .env.example .env.local     # then fill in your Supabase URL + anon key
npm run dev                    # http://localhost:3000
```

Supabase is required — see **[docs/supabase-setup.md](docs/supabase-setup.md)**
for creating the project, running the migrations and claiming your workspace.

Without credentials the app renders a setup screen naming the missing variables
rather than starting. It deliberately does **not** fall back to placeholder
data: a misconfigured deployment that looks healthy while showing invented
occupancy and revenue is a worse failure than one that refuses to boot.

| Script | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run start` | Serve the production build (`PORT` respected) |
| `npm run lint` | ESLint, including the React Compiler rules |
| `npm run typecheck` | `tsc --noEmit` |

---

## Feature map

| Area | What's there |
|---|---|
| **Dashboard** | 13 KPIs with period-over-period deltas, revenue / profit / occupancy / bookings trends, booking-source and expense breakdowns, top performers, today's operations, live apartment status |
| **Calendar** | Apartment-per-row timeline in month / week / day scale; drag to move a stay between dates *and* apartments, drag either edge to resize, double-click an empty night to book it, live conflict detection, hover tooltips |
| **Bookings** | Filterable table (apartment, status, source, payment state, date basis), bulk export / print / cancel / delete, and a detail drawer with details, guest, payments, invoices, notes and timeline tabs |
| **Apartments** | Grid and table views, live status tiles that filter the list, and a profile with overview, performance, availability heatmap, bookings, expenses, housekeeping, amenities, pricing and gallery |
| **Guests** | Segments (in house, repeat, VIP, blacklisted), lifetime value, and a profile with booking history, invoices, payments, documents, notes and a communication timeline |
| **Invoices** | Printable document, email to guest, duplicate, void, record payment, CSV export |
| **Payments** | Cash-flow chart, method mix, largest outstanding balances, full transaction ledger |
| **Expenses** | 12 categories, recurring costs, per-apartment attribution, three analysis charts |
| **Reports** | Financial, occupancy, apartment performance, booking sources, guest statistics, seasonality, cancellations, cleaning & maintenance — each exportable to CSV or PDF (print) |
| **Sharing** | Per-apartment public link for clients — photos, amenities, location and rate, with WhatsApp link previews. Off by default; rotating the token revokes links already sent |
| **Companies** | One account, many companies — each a separate tenant with its own currency, invoice series, staff and books. Switch from the top bar; create new ones in-app |
| **Settings** | Company, invoicing, appearance, notification rules, team & roles, security, data & backup |
| **Everywhere** | ⌘K command palette, global search, dark mode, keyboard shortcuts (`g` + letter), skeletons, empty states, toasts, confirmation dialogs, sticky headers and filters, responsive down to 390px |

---

## Architecture

```
src/
  app/
    (app)/            Authenticated routes — dashboard, calendar, bookings, …
    login/            Sign-in
    layout.tsx        Root layout + providers
    globals.css       Design tokens (light + dark), Tailwind theme bridge
  components/
    ui/               Primitives: button, card, field, data-table, overlay, menu…
    layout/           App shell, sidebar, topbar, command palette, date filter
    charts/           Chart frame (legend + table twin) and chart primitives
    dashboard/ bookings/ apartments/ guests/ invoices/ payments/
  data/
    analytics.ts      KPI / trend / breakdown engine — the single source of truth
    repository.ts     Supabase data access — the single seam to the backend
    queries.ts        React Query hooks and mutations
  hooks/              Date filter, auth, analytics, search, storage, client guard
  lib/                Formatting, date ranges, schemas, constants, utils
  types/              Domain model and Supabase schema types
supabase/migrations/  Schema, RLS, views, bootstrap
```

### The decisions worth knowing

**One snapshot, many projections.** A rental portfolio is small — tens of
apartments, thousands of bookings. `repository.snapshot()` fetches the working
set once and every screen derives from it with memoised selectors. That makes
cross-entity filtering instant and, more importantly, guarantees that the
revenue figure on the dashboard and the one on the reports page are computed
from identical data.

**Money is integer minor units, end to end.** The database stores cents, the
repositories return cents, and `lib/format.ts` is the only place that divides
by 100. No float arithmetic ever touches a monetary value.

**Revenue is recognised per night, not on the booking date.** A stay spanning a
month boundary contributes to both months in proportion. This is what makes
"This month" mean the same thing on every screen. ADR and RevPAR use
accommodation revenue as their basis; "Total revenue" includes fees and tax.
Cancelled and no-show bookings never contribute to revenue, occupancy, ADR or
RevPAR — only to the cancellation rate.

**Overbooking is prevented in the database, not just the UI.** A GiST exclusion
constraint on `bookings` makes overlapping live stays for one apartment
physically impossible. The calendar and the booking form check the same rule
early so the user sees an affordance instead of an error, but the constraint is
the authority.

**Document numbers come from the database.** Booking references, invoice
numbers and receipt numbers are assigned by a `before insert` trigger, inside
the inserting transaction. Deriving them in the client — from the length of the
loaded list — produced reused numbers the moment two people worked at once or
old rows aged out of the loaded window.

**One date filter for the whole app.** There are deliberately no per-card date
pickers. A single control in the top bar scopes every KPI, chart, table and
report, so two numbers on one screen can never describe different periods.

**One data seam.** Every screen reads through `repository.ts` rather than
touching Supabase directly, so org scoping, error translation and the shape of
each payload are defined in exactly one place.

**Companies are tenants, not filters.** One account can belong to several
companies; each has its own currency, invoice series, staff and books, and RLS
evaluates membership per organisation. The switcher changes which organisation
every query addresses, and the React Query cache is keyed by company so
switching can never surface the previous one's numbers.

---

## Database

The schema lives in [`supabase/migrations/`](supabase/migrations/):

- **`0001_init.sql`** — tables, enums, indexes, triggers, row-level security and
  reporting views.
- **`0002_bootstrap.sql`** — storage buckets, org-scoped storage policies, and a
  helper that makes your first user the owner of a workspace.
- **`0003_view_security.sql`** — makes the reporting views run as the caller so
  they cannot bypass row-level security.
- **`0004_multi_company.sql`** — `create_organization` / `leave_organization`,
  so companies can be managed from the app without an INSERT policy on
  `memberships`.
- **`0005_lock_bootstrap.sql`** — revokes API access to the admin bootstrap
  helper.
- **`0006_public_listings.sql`** — shareable apartment links: a per-apartment
  token and `get_public_listing`, the one fixed window guests read through.
- **`0007_document_numbers.sql`** — booking, invoice and receipt numbers
  allocated by the database inside the inserting transaction.

Highlights:

- Every tenant-owned row carries `org_id`, and RLS resolves membership through a
  `SECURITY DEFINER` helper so policies can't recurse. Multi-property support is
  in the model from day one.
- `bookings_no_overlap` — the GiST exclusion constraint described above.
- `nights` is a generated column; the app never writes it.
- `booking_balances` and `booking_nights` views give the reporting layer balance
  and per-night revenue without repeating date maths in the client.

### Setting it up

1. Create a Supabase project.
2. Run `0001` through `0006` from `supabase/migrations/`, in order.
3. Create your user under **Authentication → Users**.
4. Run `select bootstrap_workspace('you@example.com', 'Your Company');`
5. Put the project URL and anon key in `.env.local`.

Auth, protected routes and automatic session refresh are already wired — see
`src/proxy.ts`.

---

## Deployment

See **[docs/deployment.md](docs/deployment.md)** for a step-by-step Hostinger
guide (Node app, PM2, reverse proxy, SSL) plus notes for Vercel and Docker.

The short version for any Node host:

```bash
npm ci
npm run build
npm run start        # honours $PORT
```

---

## Design

The visual system and the chart-colour methodology — including the
colour-vision validation the palette had to pass — are documented in
**[docs/design.md](docs/design.md)**.
