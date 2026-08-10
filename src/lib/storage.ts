"use client";

import { getBrowserSupabase } from "@/lib/supabase/client";
import { getActiveOrg } from "@/data/repository";

/**
 * Apartment photo storage.
 *
 * Objects are pathed `{org_id}/apartments/{apartment_id}/{file}`. The leading
 * folder is what makes storage multi-tenant — the bucket policies in
 * `0002_bootstrap.sql` check org membership against it, so a member of one
 * company cannot write into another's folder.
 *
 * The bucket is public-read because these photos are shown to guests on shared
 * listing pages; writes stay restricted to members.
 */

export const APARTMENT_BUCKET = "apartment-images";

const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/avif"];

export interface UploadResult {
  url: string;
  path: string;
}

function extensionFor(file: File): string {
  const fromName = file.name.split(".").pop()?.toLowerCase();
  if (fromName && /^[a-z0-9]{2,5}$/.test(fromName)) return fromName;
  return file.type.split("/")[1] ?? "jpg";
}

/** Validates a file before it costs a round trip. Returns null when fine. */
export function rejectionReason(file: File): string | null {
  if (!ALLOWED.includes(file.type)) {
    return `${file.name}: only JPEG, PNG, WebP and AVIF images are supported`;
  }
  if (file.size > MAX_BYTES) {
    return `${file.name}: ${(file.size / 1024 / 1024).toFixed(1)} MB exceeds the 8 MB limit`;
  }
  return null;
}

export async function uploadApartmentImage(
  apartmentId: string,
  file: File,
): Promise<UploadResult> {
  const orgId = getActiveOrg();
  if (!orgId) throw new Error("No active company — cannot upload.");

  const rejection = rejectionReason(file);
  if (rejection) throw new Error(rejection);

  // Random name: two guests uploading "IMG_1234.jpg" must not collide, and the
  // original filename is not worth leaking into a public URL.
  const unique =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const path = `${orgId}/apartments/${apartmentId}/${unique}.${extensionFor(file)}`;

  const supabase = getBrowserSupabase();
  const { error } = await supabase.storage.from(APARTMENT_BUCKET).upload(path, file, {
    cacheControl: "31536000",
    upsert: false,
    contentType: file.type,
  });
  if (error) throw new Error(`Upload failed: ${error.message}`);

  const { data } = supabase.storage.from(APARTMENT_BUCKET).getPublicUrl(path);
  return { url: data.publicUrl, path };
}

/**
 * Removes the underlying object. Best-effort: the apartment record is the
 * source of truth for which photos are shown, so a storage object that outlives
 * its row is untidy but harmless, and must not block the user's edit.
 */
export async function deleteApartmentImage(url: string): Promise<void> {
  const path = storagePathFromUrl(url);
  if (!path) return;
  const supabase = getBrowserSupabase();
  await supabase.storage.from(APARTMENT_BUCKET).remove([path]);
}

/** Recovers the object path from a public URL, or null if it isn't one of ours. */
export function storagePathFromUrl(url: string): string | null {
  const marker = `/storage/v1/object/public/${APARTMENT_BUCKET}/`;
  const index = url.indexOf(marker);
  if (index === -1) return null;
  return decodeURIComponent(url.slice(index + marker.length));
}

/* ------------------------------------------------------------------ */
/* Expense documents                                                   */
/* ------------------------------------------------------------------ */

/**
 * Scanned bills live in the private `documents` bucket.
 *
 * Unlike apartment photos these are never public: a utility bill carries a
 * meter number, an address and often an account reference. The stored value is
 * therefore the object *path*, not a URL — a public URL would not work, and a
 * signed one would be dead by the time anyone clicked it. `signedDocumentUrl`
 * mints a short-lived link on demand instead.
 *
 * The path needs no expense id. Security comes from the leading org folder,
 * which is what the bucket policies check, so the file can be uploaded before
 * the expense row exists — which is what lets the user attach it while filling
 * the form rather than having to save first.
 */
export const DOCUMENT_BUCKET = "documents";

const DOC_MAX_BYTES = 8 * 1024 * 1024;
const DOC_ALLOWED = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
];

export function documentRejectionReason(file: File): string | null {
  if (!DOC_ALLOWED.includes(file.type)) {
    return `${file.name}: only PDF, JPEG, PNG, WebP and HEIC are supported`;
  }
  if (file.size > DOC_MAX_BYTES) {
    return `${file.name}: ${(file.size / 1024 / 1024).toFixed(1)} MB exceeds the 8 MB limit`;
  }
  return null;
}

/** Uploads a bill and returns the storage path to persist. */
export async function uploadExpenseDocument(file: File): Promise<string> {
  const orgId = getActiveOrg();
  if (!orgId) throw new Error("No active company — cannot upload.");

  const rejection = documentRejectionReason(file);
  if (rejection) throw new Error(rejection);

  const unique =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const path = `${orgId}/expenses/${unique}.${extensionFor(file)}`;

  const supabase = getBrowserSupabase();
  const { error } = await supabase.storage.from(DOCUMENT_BUCKET).upload(path, file, {
    cacheControl: "3600",
    upsert: false,
    contentType: file.type,
  });
  if (error) throw new Error(`Upload failed: ${error.message}`);
  return path;
}

/** A link valid for a few minutes — long enough to open, not to leak. */
export async function signedDocumentUrl(path: string): Promise<string | null> {
  const supabase = getBrowserSupabase();
  const { data, error } = await supabase.storage
    .from(DOCUMENT_BUCKET)
    .createSignedUrl(path, 300);
  return error ? null : data.signedUrl;
}

export async function deleteExpenseDocument(path: string): Promise<void> {
  if (!path) return;
  const supabase = getBrowserSupabase();
  await supabase.storage.from(DOCUMENT_BUCKET).remove([path]);
}
