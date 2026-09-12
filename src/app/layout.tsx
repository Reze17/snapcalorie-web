import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import {
  Geist,
  Geist_Mono,
  Bricolage_Grotesque,
  Karla,
  IBM_Plex_Mono,
} from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// SnapCalorie's type system: Bricolage Grotesque for headings/nav/display,
// Karla for body/UI text, IBM Plex Mono (tabular figures) for every
// calorie/macro/gram number — see globals.css's @theme block.
const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
});

const karla = Karla({
  variable: "--font-karla",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "SnapCalorie Web",
  description: "AI meal-photo calorie tracker",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${bricolage.variable} ${karla.variable} ${plexMono.variable} antialiased`}
      >
        {children}
        {/* No-op locally / until Web Analytics is enabled on the Vercel
            project (that toggle needs interactive confirmation, so it's
            a manual step) — safe to ship unconditionally either way. */}
        <Analytics />
      </body>
    </html>
  );
}
