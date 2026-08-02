"use client";

import { useState } from "react";
import { Check, Copy, ExternalLink, Link2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n";
import { useUpdateApartment } from "@/data/queries";
import { Dialog, useConfirm } from "@/components/ui/overlay";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/field";
import type { Apartment } from "@/types/domain";

/** WhatsApp's share endpoint — opens the app on mobile, web client otherwise. */
function whatsappHref(text: string) {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

function newToken(): string {
  const bytes = new Uint8Array(9);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Share an apartment with a client.
 *
 * The link is public to anyone holding it — that is the point, since it goes
 * over WhatsApp — so the two controls that matter are the on/off switch and the
 * ability to invalidate links already sent.
 */
export function ShareDialog({
  apartment,
  open,
  onClose,
}: {
  apartment: Apartment;
  open: boolean;
  onClose: () => void;
}) {
  const t = useT();
  const updateApartment = useUpdateApartment();
  const { confirm, dialog } = useConfirm();
  const [copied, setCopied] = useState(false);

  // Built in the browser so it carries whatever host the app is actually served
  // from — localhost in development, the real domain in production.
  const url =
    typeof window === "undefined"
      ? ""
      : `${window.location.origin}/listing/${apartment.share_token}`;

  const message = `${apartment.name}\n${url}`;

  const setPublic = (isPublic: boolean) => {
    updateApartment.mutate({ id: apartment.id, patch: { is_public: isPublic } });
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error(t.apartments.couldNotCopy);
    }
  };

  const rotate = async () => {
    const ok = await confirm({
      title: t.apartments.generateNewLinkConfirm,
      message:
        "Anyone still holding the old link will stop being able to open this apartment. Use this if a link was shared by mistake.",
      confirmLabel: t.apartments.generateNewLink,
      destructive: true,
    });
    if (!ok) return;
    updateApartment.mutate({ id: apartment.id, patch: { share_token: newToken() } });
  };

  return (
    <>
      <Dialog
        open={open}
        onClose={onClose}
        title={t.apartments.shareThisApartment}
        description="Send a client a link showing the photos, details and location. No login needed on their side."
        size="md"
        footer={
          <Button variant="ghost" onClick={onClose}>
            Done
          </Button>
        }
      >
        <div className="space-y-5">
          <div className="rounded-xl border border-line p-4">
            <Switch
              checked={apartment.is_public}
              onCheckedChange={setPublic}
              label={t.apartments.anyoneWithLink}
              description={
                apartment.is_public
                  ? "The page is live. Only what a guest needs is shown — never your bookings, guests or financials."
                  : t.apartments.sharingOff
              }
            />
          </div>

          <div className={cn("space-y-3", !apartment.is_public && "opacity-50")}>
            <div className="flex items-center gap-2">
              <span className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-xl border border-line bg-surface-2 px-3">
                <Link2 className="size-4 shrink-0 text-ink-3" aria-hidden />
                <span className="truncate text-[13px] text-ink-2">{url}</span>
              </span>
              <Button
                variant="outline"
                disabled={!apartment.is_public}
                onClick={copy}
                icon={copied ? <Check className="size-4" /> : <Copy className="size-4" />}
              >
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <a
                href={apartment.is_public ? whatsappHref(message) : undefined}
                target="_blank"
                rel="noopener noreferrer"
                aria-disabled={!apartment.is_public}
                onClick={(event) => {
                  if (!apartment.is_public) event.preventDefault();
                }}
                className={cn(
                  "inline-flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-medium",
                  "bg-[#25D366] text-white transition-opacity",
                  apartment.is_public ? "hover:opacity-90" : "pointer-events-none",
                )}
              >
                Send on WhatsApp
              </a>

              <a
                href={apartment.is_public ? url : undefined}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(event) => {
                  if (!apartment.is_public) event.preventDefault();
                }}
                className={cn(
                  "inline-flex h-10 items-center gap-2 rounded-xl border border-line px-4 text-sm font-medium text-ink",
                  apartment.is_public ? "hover:bg-surface-3" : "pointer-events-none",
                )}
              >
                <ExternalLink className="size-4" aria-hidden />
                Preview
              </a>

              <Button
                variant="ghost"
                className="ml-auto"
                disabled={!apartment.is_public}
                onClick={() => void rotate()}
                icon={<RefreshCw className="size-4" />}
              >
                New link
              </Button>
            </div>
          </div>

          <p className="rounded-xl bg-surface-2 px-3.5 py-3 text-[12.5px] leading-relaxed text-ink-2">
            The page shows photos, description, amenities, capacity, location and the
            nightly rate. It cannot reach your bookings, guests, invoices or any other
            apartment — the database only ever returns those specific fields.
          </p>
        </div>
      </Dialog>
      {dialog}
    </>
  );
}
