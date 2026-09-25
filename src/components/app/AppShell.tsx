"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import Logo from "../Logo";
import WalletButton from "../WalletButton";
import { useMarkets } from "../useMarkets";
import { ago } from "@/lib/format";

const NAV = [
  { href: "/app/markets", label: "Markets", icon: "M3 17l5-5 4 4 8-8M14 8h6v6" },
  { href: "/app/split", label: "Split", icon: "M12 3v6M12 9l-6 6M12 9l6 6M4 19h4M16 19h4" },
  { href: "/app/trade", label: "Trade", icon: "M7 7h13l-3-3M17 17H4l3 3" },
  { href: "/app/portfolio", label: "Portfolio", icon: "M4 7h16v12H4zM8 7V5h8v2" },
  { href: "/app/replay", label: "Replay", icon: "M4 12a8 8 0 1 0 3-6.2M4 4v4h4M12 8v4l3 2" },
];

function Icon({ d }: { d: string }) {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>;
}

function Status() {
  const { data, error } = useMarkets();
  const spy = data?.markets.find((m) => m.x === "SPYx");
  const ok = !!spy?.xPrice && !!spy?.multiplier;
  return (
    <div className="hidden items-center gap-2 text-[11px] lg:flex">
      <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 ${ok ? "border-lime/25 bg-lime/10 text-lime" : "border-line-2 bg-surface text-dim"}`}>
        <span className={`live-dot h-1.5 w-1.5 rounded-full ${ok ? "bg-lime" : "bg-dim"}`} />
        {spy ? (spy.priceSource === "pyth" ? "Pyth live" : spy.priceSource === "jupiter" ? "Prices live" : "Pyth last update") : error ? "Prices offline" : "Prices …"}
      </span>
      <span className="inline-flex items-center gap-1.5 rounded-full border border-line-2 bg-surface px-2.5 py-1 text-dim">Multipliers · Mainnet</span>
      <span className="inline-flex items-center gap-1.5 rounded-full border border-share/30 bg-share/10 px-2.5 py-1 text-share">Vault · Paper ledger</span>
    </div>
  );
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const active = (h: string) => path === h || (h === "/app/markets" && path === "/app");
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-line bg-bg/75 backdrop-blur-[14px]">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex items-center gap-8">
            <Logo href="/" />
            <nav className="hidden items-center gap-1 md:flex">
              {NAV.map((n) => (
                <Link key={n.href} href={n.href} className={`relative rounded-full px-3.5 py-2 text-sm transition-colors ${active(n.href) ? "text-bg" : "text-dim hover:text-ink"}`}>
                  {active(n.href) && <motion.span layoutId="nav-pill" className="absolute inset-0 rounded-full bg-lime" transition={{ type: "spring", stiffness: 420, damping: 34 }} />}
                  <span className="relative">{n.label}</span>
                </Link>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <Status />
            <WalletButton compact />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 pb-28 pt-6 sm:px-6 sm:pt-8 md:pb-16">{children}</main>
      {/* mobile tab bar */}
      <nav className="fixed inset-x-3 bottom-[max(12px,env(safe-area-inset-bottom))] z-40 flex justify-around rounded-2xl border border-line-2 bg-surface/90 p-1.5 shadow-[0_10px_30px_-10px_rgba(0,0,0,.35)] backdrop-blur-md md:hidden">
        {NAV.map((n) => (
          <Link key={n.href} href={n.href} className={`relative flex min-h-12 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl py-1.5 text-[10px] ${active(n.href) ? "text-bg" : "text-dim"}`}>
            {active(n.href) && <motion.span layoutId="tab-pill" className="absolute inset-0 rounded-xl bg-lime" />}
            <span className="relative"><Icon d={n.icon} /></span>
            <span className="relative">{n.label}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
