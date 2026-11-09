import type { Metadata, Viewport } from "next";
import "./globals.css";
import "../vanilla/themes.css";

export const metadata: Metadata = {
  title: "Kampa — Your ad buddy that never sleeps",
  description: "One read-only dashboard for Google Ads, Meta, TikTok, and YouTube metrics. Credentials stay on the server.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#111315",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body data-theme="graphite">{children}</body>
    </html>
  );
}
