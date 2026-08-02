import { cn } from "@/lib/utils";

/**
 * Apartment cover image.
 *
 * Falls back to a deterministic gradient tile derived from the apartment code,
 * so a portfolio with no uploaded photos still reads as a designed grid rather
 * than a wall of broken image icons. Once a `cover_image` is stored (Supabase
 * Storage), the real photo takes over with no change at the call site.
 */
export function ApartmentImage({
  code,
  name,
  src,
  className,
  rounded = "rounded-xl",
}: {
  code: string;
  name: string;
  src?: string | null;
  className?: string;
  rounded?: string;
}) {
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={name}
        loading="lazy"
        className={cn("object-cover", rounded, className)}
      />
    );
  }

  let hash = 0;
  for (let index = 0; index < code.length; index += 1) {
    hash = (hash * 31 + code.charCodeAt(index)) >>> 0;
  }
  // Sequential codes (A-001, A-002…) hash one apart, so taking the hue
  // directly would paint the whole grid a single colour. Stepping by the
  // golden angle spreads consecutive units right across the wheel.
  const hue = Math.round(hash * 137.508) % 360;

  return (
    <div
      role="img"
      aria-label={`${name} placeholder image`}
      className={cn("relative overflow-hidden", rounded, className)}
      style={{
        background: `linear-gradient(135deg,
          hsl(${hue} 46% 78%) 0%,
          hsl(${(hue + 34) % 360} 52% 68%) 55%,
          hsl(${(hue + 62) % 360} 44% 58%) 100%)`,
      }}
    >
      <span
        aria-hidden
        className="absolute inset-0 opacity-25"
        style={{
          background:
            "radial-gradient(circle at 22% 22%, rgba(255,255,255,0.9), transparent 46%)",
        }}
      />
      <span className="absolute bottom-2 left-2.5 text-[11px] font-semibold tracking-wide text-white/90 drop-shadow">
        {code}
      </span>
    </div>
  );
}
