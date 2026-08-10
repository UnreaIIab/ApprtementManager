import type { Metadata } from "next";
import {
  BedDouble, Bath, Check, Mail, MapPin, Moon, Phone, Ruler, Users,
} from "lucide-react";
import { fetchPublicListing, type PublicListing } from "@/lib/supabase/public";
import { fr } from "@/i18n/fr";
import { Gallery } from "./gallery";

/*
 * Guest-facing and always French: this page is server-rendered for a link
 * preview before any company setting is known, and the people it is sent to
 * read French.
 */
const L = fr.listing;

export const revalidate = 300;

function money(minor: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(minor / 100);
  } catch {
    return `${(minor / 100).toFixed(0)} ${currency}`;
  }
}

function locationLine(listing: PublicListing) {
  return [listing.address, listing.city, listing.country].filter(Boolean).join(", ");
}

/**
 * Link preview metadata.
 *
 * This is what WhatsApp, Messenger and iMessage render when the link is pasted
 * into a chat — without it the client sees a bare URL. The cover photo becomes
 * the preview image, so it is worth the extra fetch.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  const listing = await fetchPublicListing(token);

  if (!listing) {
    return { title: L.unavailable, robots: { index: false, follow: false } };
  }

  const where = [listing.city, listing.country].filter(Boolean).join(", ");
  const title = where ? `${listing.name} · ${where}` : listing.name;
  const description =
    listing.description?.slice(0, 200) ??
    `${listing.bedrooms} bedroom · sleeps ${listing.capacity} · from ${money(listing.nightly_rate, listing.currency)} per night`;
  const image = listing.cover_image ?? listing.images[0];

  return {
    title,
    description,
    // A shared link is for one client, not for search engines.
    robots: { index: false, follow: false },
    openGraph: {
      title,
      description,
      type: "website",
      images: image ? [{ url: image }] : undefined,
    },
    twitter: {
      card: image ? "summary_large_image" : "summary",
      title,
      description,
      images: image ? [image] : undefined,
    },
  };
}

export default async function ListingPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const listing = await fetchPublicListing(token);

  if (!listing) return <Unavailable />;
  return <ListingView listing={listing} />;
}

/**
 * The listing markup, separated from the fetch so it can be rendered from any
 * source — including a fixture, which is the only way to review this page
 * before a real apartment has been shared.
 */
export function ListingView({ listing }: { listing: PublicListing }) {
  const where = locationLine(listing);
  const mapsHref = listing.latitude && listing.longitude
    ? `https://www.google.com/maps/search/?api=1&query=${listing.latitude},${listing.longitude}`
    : where
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(where)}`
      : null;

  const facts = [
    { icon: <BedDouble className="size-4" />, label: L.bedrooms(listing.bedrooms) },
    { icon: <Bath className="size-4" />, label: L.bathrooms(listing.bathrooms) },
    { icon: <Users className="size-4" />, label: L.sleeps(listing.capacity) },
    { icon: <Moon className="size-4" />, label: L.nightMinimum(listing.min_nights) },
    ...(listing.size_sqm
      ? [{ icon: <Ruler className="size-4" />, label: `${listing.size_sqm} m²` }]
      : []),
  ];

  return (
    <main className="min-h-dvh bg-plane pb-16">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto max-w-4xl px-5 py-4">
          <p className="text-[13px] font-semibold tracking-[-0.01em] text-ink">
            {listing.company}
          </p>
        </div>
      </header>

      <div className="mx-auto max-w-4xl px-5">
        <Gallery images={listing.images} cover={listing.cover_image} name={listing.name} />

        <div className="mt-6 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.03em] text-ink sm:text-[32px]">
              {listing.name}
            </h1>
            {where ? (
              <p className="mt-1.5 flex items-center gap-1.5 text-[14px] text-ink-2">
                <MapPin className="size-4 shrink-0 text-ink-3" aria-hidden />
                {where}
              </p>
            ) : null}
          </div>

          <div className="shrink-0 rounded-xl border border-line bg-surface px-4 py-3 text-right">
            <p className="text-[22px] font-semibold tracking-[-0.02em] text-ink">
              {money(listing.nightly_rate, listing.currency)}
            </p>
            <p className="text-[12px] text-ink-3">{L.perNight}</p>
          </div>
        </div>

        <ul className="mt-5 flex flex-wrap gap-x-5 gap-y-2 border-y border-line py-4">
          {facts.map((fact) => (
            <li key={fact.label} className="flex items-center gap-2 text-[13.5px] text-ink-2">
              <span className="text-ink-3" aria-hidden>{fact.icon}</span>
              {fact.label}
            </li>
          ))}
        </ul>

        {listing.description ? (
          <section className="mt-6">
            <h2 className="text-[15px] font-semibold text-ink">{L.aboutThisPlace}</h2>
            <p className="mt-2 whitespace-pre-line text-[14px] leading-relaxed text-ink-2">
              {listing.description}
            </p>
          </section>
        ) : null}

        {listing.amenities.length > 0 ? (
          <section className="mt-7">
            <h2 className="text-[15px] font-semibold text-ink">{L.whatOffers}</h2>
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {listing.amenities.map((amenity) => (
                <li key={amenity} className="flex items-center gap-2 text-[13.5px] text-ink-2">
                  <Check className="size-4 shrink-0 text-good" aria-hidden />
                  {amenity}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {listing.latitude && listing.longitude ? (
          <section className="mt-7">
            <h2 className="text-[15px] font-semibold text-ink">{L.whereYoullBe}</h2>
            <div className="mt-3 overflow-hidden rounded-card border border-line">
              {/* OpenStreetMap needs no API key, so a shared link never depends
                  on a billing account staying active. */}
              <iframe
                title={L.mapShowing(listing.name)}
                loading="lazy"
                className="h-[320px] w-full border-0"
                src={`https://www.openstreetmap.org/export/embed.html?bbox=${
                  Number(listing.longitude) - 0.006
                },${Number(listing.latitude) - 0.004},${
                  Number(listing.longitude) + 0.006
                },${Number(listing.latitude) + 0.004}&layer=mapnik&marker=${listing.latitude},${listing.longitude}`}
              />
            </div>
          </section>
        ) : null}

        <section className="mt-7 rounded-card border border-line bg-surface p-5">
          <h2 className="text-[15px] font-semibold text-ink">{L.interested}</h2>
          <p className="mt-1 text-[13.5px] text-ink-2">
            Get in touch with {listing.company} to check dates and book.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {listing.company_phone ? (
              <a
                href={`https://wa.me/${listing.company_phone.replace(/[^\d]/g, "")}?text=${encodeURIComponent(
                  L.whatsappMessage(listing.name),
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#25D366] px-5 text-sm font-medium text-white hover:opacity-90"
              >
                WhatsApp
              </a>
            ) : null}
            {listing.company_phone ? (
              <a
                href={`tel:${listing.company_phone}`}
                className="inline-flex h-11 items-center gap-2 rounded-xl border border-line px-5 text-sm font-medium text-ink hover:bg-surface-3"
              >
                <Phone className="size-4" aria-hidden />
                {listing.company_phone}
              </a>
            ) : null}
            {listing.company_email ? (
              <a
                href={`mailto:${listing.company_email}?subject=${encodeURIComponent(listing.name)}`}
                className="inline-flex h-11 items-center gap-2 rounded-xl border border-line px-5 text-sm font-medium text-ink hover:bg-surface-3"
              >
                <Mail className="size-4" aria-hidden />
                Email
              </a>
            ) : null}
            {mapsHref ? (
              <a
                href={mapsHref}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-11 items-center gap-2 rounded-xl border border-line px-5 text-sm font-medium text-ink hover:bg-surface-3"
              >
                <MapPin className="size-4" aria-hidden />
                {L.openInMaps}
              </a>
            ) : null}
          </div>
        </section>

        <p className="mt-8 text-center text-[12px] text-ink-3">
          Shared by {listing.company}
        </p>
      </div>
    </main>
  );
}

/**
 * One page for every failure — unknown token, revoked link, sharing switched
 * off. Distinguishing them would tell a stranger which tokens once existed.
 */
function Unavailable() {
  return (
    <main className="grid min-h-dvh place-items-center bg-plane px-6">
      <div className="max-w-sm text-center">
        <h1 className="text-[19px] font-semibold tracking-[-0.02em] text-ink">
          {L.unavailable}
        </h1>
        <p className="mt-2 text-[14px] leading-relaxed text-ink-2">
          {L.unavailableHint}
        </p>
      </div>
    </main>
  );
}
