"use client";

import { useCallback, useRef, useState } from "react";
import { ImagePlus, Loader2, Star, Trash2, UploadCloud } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n";
import {
  deleteApartmentImage,
  rejectionReason,
  uploadApartmentImage,
} from "@/lib/storage";
import { IconButton } from "@/components/ui/button";

/**
 * Apartment photo manager.
 *
 * The first image is the cover — it is what a client sees in the listing header
 * and what WhatsApp renders in its link preview, so promoting a photo is a
 * first-class action rather than something buried in a menu.
 *
 * Uploads happen immediately, but the parent decides when to persist the
 * resulting list; that keeps this component usable both in the create form
 * (where the apartment does not exist yet) and on an existing profile.
 */
export function ImageUploader({
  apartmentId,
  images,
  coverImage,
  onChange,
  disabled,
}: {
  /** Needed to build the storage path; uploads are blocked until it exists. */
  apartmentId: string | null;
  images: string[];
  coverImage: string | null;
  onChange: (next: { images: string[]; coverImage: string | null }) => void;
  disabled?: boolean;
}) {
  const t = useT();
  const [uploading, setUploading] = useState(0);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const accept = async (files: FileList | File[]) => {
    const list = Array.from(files);
    if (!list.length) return;

    if (!apartmentId) {
      toast.error(t.apartments.saveFirst, {
        description: t.apartments.photosNeedHome,
      });
      return;
    }

    // Reject locally before spending a round trip on anything oversized.
    const rejected = list.map(rejectionReason).filter(Boolean) as string[];
    const accepted = list.filter((file) => !rejectionReason(file));
    rejected.forEach((reason) => toast.error(reason));
    if (!accepted.length) return;

    setUploading((count) => count + accepted.length);
    const uploaded: string[] = [];

    // Sequential rather than parallel: a phone gallery selection can be a dozen
    // multi-megabyte files, and firing them all at once tends to stall on
    // mobile connections.
    for (const file of accepted) {
      try {
        const result = await uploadApartmentImage(apartmentId, file);
        uploaded.push(result.url);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : t.apartments.uploadFailed);
      } finally {
        setUploading((count) => count - 1);
      }
    }

    if (uploaded.length) {
      const next = [...images, ...uploaded];
      onChange({ images: next, coverImage: coverImage ?? next[0] });
      toast.success(`${uploaded.length} photo${uploaded.length === 1 ? "" : "s"} added`);
    }
  };

  const remove = useCallback(
    async (url: string) => {
      const next = images.filter((image) => image !== url);
      onChange({
        images: next,
        coverImage: coverImage === url ? (next[0] ?? null) : coverImage,
      });
      await deleteApartmentImage(url);
    },
    [images, coverImage, onChange],
  );

  const busy = uploading > 0;

  return (
    <div>
      <div
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          if (!disabled) void accept(event.dataTransfer.files);
        }}
        className={cn(
          "rounded-xl border border-dashed p-5 text-center transition-colors",
          dragging ? "border-brand bg-brand-wash" : "border-line-strong",
          disabled && "opacity-50",
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/avif"
          multiple
          disabled={disabled || busy}
          className="sr-only"
          onChange={(event) => {
            if (event.target.files) void accept(event.target.files);
            // Allow re-selecting the same file after a failure.
            event.target.value = "";
          }}
        />

        <div className="grid place-items-center gap-2">
          <span className="grid size-10 place-items-center rounded-xl bg-surface-3 text-ink-3">
            {busy ? (
              <Loader2 className="size-5 animate-spin" aria-hidden />
            ) : (
              <UploadCloud className="size-5" aria-hidden />
            )}
          </span>
          <p className="text-[13px] text-ink">
            {busy ? (
              `Uploading ${uploading} photo${uploading === 1 ? "" : "s"}…`
            ) : (
              <>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => inputRef.current?.click()}
                  className="font-medium text-brand hover:underline disabled:no-underline"
                >
                  Choose photos
                </button>{" "}
                or drag them here
              </>
            )}
          </p>
          <p className="text-[11.5px] text-ink-3">
            JPEG, PNG, WebP or AVIF · up to 8 MB each
          </p>
        </div>
      </div>

      {images.length > 0 ? (
        <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {images.map((url) => {
            const isCover = url === coverImage;
            return (
              <li
                key={url}
                className={cn(
                  "group relative overflow-hidden rounded-xl border bg-surface-2",
                  isCover ? "border-brand ring-1 ring-brand/30" : "border-line",
                )}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={url}
                  alt=""
                  loading="lazy"
                  className="aspect-[4/3] w-full object-cover"
                />

                {isCover ? (
                  <span className="absolute left-2 top-2 rounded-full bg-brand px-2 py-0.5 text-[10px] font-semibold text-brand-ink">
                    Cover
                  </span>
                ) : null}

                <div className="absolute inset-x-0 bottom-0 flex justify-end gap-1 bg-gradient-to-t from-black/55 to-transparent p-1.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                  {!isCover ? (
                    <IconButton
                      label={t.apartments.useAsCover}
                      variant="subtle"
                      onClick={() => onChange({ images, coverImage: url })}
                      icon={<Star className="size-3.5" />}
                    />
                  ) : null}
                  <IconButton
                    label={t.apartments.removePhoto}
                    variant="danger"
                    onClick={() => void remove(url)}
                    icon={<Trash2 className="size-3.5" />}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-3 flex items-center gap-2 text-[12.5px] text-ink-3">
          <ImagePlus className="size-4" aria-hidden />
          The first photo you add becomes the cover — it&apos;s what clients see first.
        </p>
      )}
    </div>
  );
}
