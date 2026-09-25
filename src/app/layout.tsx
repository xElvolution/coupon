import type { Metadata, Viewport } from "next";
import { Fraunces, Inter_Tight, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import "@solana/wallet-adapter-react-ui/styles.css";
import Providers from "@/components/Providers";
import { getSnapshotFast } from "@/lib/cache";

// Every page carries the last good market snapshot in its HTML, so numbers show on first paint.
export const dynamic = "force-dynamic";

const fraunces = Fraunces({ subsets: ["latin"], variable: "--font-fraunces", axes: ["opsz"], display: "swap" });
const inter = Inter_Tight({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono", display: "swap" });

export const metadata: Metadata = {
  title: "COUPON · Sell next year's dividends today",
  description: "COUPON splits xStocks on Solana into principal and a 12 month dividend claim you can sell for cash today.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#0a0b0d" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const initial = await getSnapshotFast();
  return (
    <html lang="en" className={`${fraunces.variable} ${inter.variable} ${mono.variable}`}>
      <body className="noise min-h-screen">
        <Providers initial={initial}>{children}</Providers>
      </body>
    </html>
  );
}
