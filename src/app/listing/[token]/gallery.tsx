"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, ImageOff, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { fr } from "@/i18n/fr";

/*
 * Guest-facing and always French: this page is server-rendered for a link
 * preview before any company setting is known, and the people it is sent to
 * read French.
 */
const L = fr.listing;

/**
 * Listing photo gallery.
 *
 * Built for the phone, because a link sent over WhatsApp is opened on one
 * almost every time: a single tall hero, a thumbnail strip, and a full-screen
 * viewer with swipe-sized tap targets rather than a desktop-style grid.
 */
export function Gallery({
  images,
  cover,
  name,
}: {
  images: string[];
  cover: string | null;
  name: string;
}) {
  // Cover first, then the rest — the order the manager chose.
  const ordered = cover ? [cover, ...images.filter((image) => image !== cover)] : images;
  const [index, setIndex] = useState(0);
  const [open, setOpen] = useState(false);

  if (!ordered.length) {
    return (
      <div className="mt-5 grid aspect-[16/10] place-items-center rounded-card border border-line bg-surface-2 text-ink-3">
        <span className="flex flex-col items-center gap-2">
          <ImageOff className="size-6" aria-hidden />
          <span className="text-[13px]">{L.noPhotos}</span>
        </span>
      </div>
    );
  }

  const step = (delta: number) =>
    setIndex((current) => (current + delta + ordered.length) % ordered.length);

  return (
    <>
      <div className="mt-5">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="relative block w-full overflow-hidden rounded-card border border-line bg-surface-2"
          aria-label={L.viewPhotos(name)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={ordered[index]}
            alt={name}
            className="aspect-[16/10] w-full object-cover"
          />
          {ordered.length > 1 ? (
            <span className="absolute bottom-3 right-3 rounded-full bg-black/60 px-2.5 py-1 text-[11px] font-medium text-white tnum">
              {index + 1} / {ordered.length}
            </span>
          ) : null}
        </button>

        {ordered.length > 1 ? (
          <ul className="no-scrollbar mt-2 flex gap-2 overflow-x-auto">
            {ordered.map((image, position) => (
              <li key={image}>
                <button
                  type="button"
                  onClick={() => setIndex(position)}
                  aria-label={L.photoN(position + 1)}
                  aria-current={position === index}
                  className={cn(
                    "block overflow-hidden rounded-lg border transition-colors",
                    position === index ? "border-ink" : "border-line hover:border-line-strong",
                  )}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={image} alt="" loading="lazy" className="size-16 object-cover" />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={L.photosOf(name)}
          className="fixed inset-0 z-50 flex flex-col bg-black/95"
          onClick={() => setOpen(false)}
        >
          <div className="flex justify-end p-4">
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label={L.close}
              className="grid size-10 place-items-center rounded-full bg-white/10 text-white"
            >
              <X className="size-5" aria-hidden />
            </button>
          </div>

          <div
            className="flex flex-1 items-center justify-center px-2"
            onClick={(event) => event.stopPropagation()}
          >
            {ordered.length > 1 ? (
              <button
                type="button"
                onClick={() => step(-1)}
                aria-label={L.previousPhoto}
                className="grid size-11 shrink-0 place-items-center rounded-full bg-white/10 text-white"
              >
                <ChevronLeft className="size-5" aria-hidden />
              </button>
            ) : null}

            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={ordered[index]}
              alt={L.photoOf(name, index + 1)}
              className="max-h-[80vh] max-w-full flex-1 object-contain"
            />

            {ordered.length > 1 ? (
              <button
                type="button"
                onClick={() => step(1)}
                aria-label={L.nextPhoto}
                className="grid size-11 shrink-0 place-items-center rounded-full bg-white/10 text-white"
              >
                <ChevronRight className="size-5" aria-hidden />
              </button>
            ) : null}
          </div>

          <p className="pb-6 text-center text-[12px] text-white/70 tnum">
            {index + 1} / {ordered.length}
          </p>
        </div>
      ) : null}
    </>
  );
}
