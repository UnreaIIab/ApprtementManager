import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: {
    default: "Atlas Stays · Property Management",
    template: "%s · Atlas Stays",
  },
  description:
    "Reservations, occupancy, revenue and expenses for serviced apartments and short-term rentals.",
  applicationName: "Atlas Stays",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f6f4" },
    { media: "(prefers-color-scheme: dark)", color: "#0c0c0e" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    /*
     * `suppressHydrationWarning` on both <html> and <body>:
     *
     *   * <html> — next-themes stamps the theme class on it before React
     *     hydrates, so the class legitimately differs from the server render.
     *   * <body> — browser extensions inject attributes here before hydration
     *     (ColorZilla's `cz-shortcut-listen`, Grammarly's `data-gr-*`, password
     *     managers, Dark Reader). Nothing in the app writes to <body>, so any
     *     mismatch on it comes from outside the page and is not actionable.
     *
     * The flag only covers the element's own attributes — it does not extend to
     * descendants, so real hydration bugs inside the app still surface.
     */
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased" suppressHydrationWarning>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
