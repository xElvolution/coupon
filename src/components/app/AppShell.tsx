"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import Logo from "../Logo";
import WalletButton from "../WalletButton";
import { useMarkets } from "../useMarkets";

type NavItem = {
  href: string;
  label: string;
  icon: string;
  badge?: string;
};

const PRIMARY_NAV: NavItem[] = [
  { href: "/app/markets", label: "Markets", icon: "M3 17l5-5 4 4 8-8M14 8h6v6" },
  { href: "/app/split", label: "Split", icon: "M12 3v6M12 9l-6 6M12 9l6 6M4 19h4M16 19h4" },
  { href: "/app/trade", label: "Trade", icon: "M7 7h13l-3-3M17 17H4l3 3" },
  { href: "/app/portfolio", label: "Portfolio", icon: "M4 7h16v12H4zM8 7V5h8v2" },
];

const MORE_NAV: NavItem[] = [
  { href: "/app/predictions", label: "Predictions", icon: "M12 3a9 9 0 1 0 9 9M12 7v5l3 3M19 3v4M17 5h4", badge: "New" },
  { href: "/app/perps", label: "Perpetuals", icon: "M4 18l5-6 4 3 7-9M15 6h5v5", badge: "20x" },
  { href: "/app/faucet", label: "Faucet", icon: "M12 3c3 4 6 7.2 6 10.5A6 6 0 0 1 6 13.5C6 10.2 9 7 12 3z" },
  { href: "/app/referrals", label: "Referrals", icon: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM19 8v6M22 11h-6" },
];

const MORE_PATHS = ["/app/predictions", "/app/perps", "/app/faucet", "/app/referrals"];

function Icon({ d }: { d: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

function MoreIcon({ open }: { open: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      {open ? (
        <path d="M18 6L6 18M6 6l12 12" />
      ) : (
        <>
          <rect x="4" y="4" width="6.5" height="6.5" rx="1.5" />
          <rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5" />
          <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5" />
          <path d="M16.75 13.5v6.5M13.5 16.75h6.5" />
        </>
      )}
    </svg>
  );
}

function Status() {
  const { data, error } = useMarkets();
  const spy = data?.markets.find((m) => m.x === "SPYx");
  const ok = !!spy?.xPrice && !!spy?.multiplier;
  return (
    <div className="hidden items-center gap-2 text-[11px] xl:flex">
      <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 ${ok ? "border-lime/25 bg-lime/10 text-lime" : "border-line-2 bg-surface text-dim"}`}>
        <span className={`live-dot h-1.5 w-1.5 rounded-full ${ok ? "bg-lime" : "bg-dim"}`} />
        {spy ? (spy.priceSource === "pyth" ? "Pyth live" : spy.priceSource === "jupiter" ? "Prices live" : "Pyth last update") : error ? "Prices offline" : "Prices …"}
      </span>
      <span className="inline-flex items-center gap-1.5 rounded-full border border-line-2 bg-surface px-2.5 py-1 text-dim">Multipliers · Mainnet</span>
      <span className="inline-flex items-center gap-1.5 rounded-full border border-share/30 bg-share/10 px-2.5 py-1 text-share">Vault · Devnet</span>
    </div>
  );
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const isMoreRoute = MORE_PATHS.some((p) => path === p || path.startsWith(`${p}/`));
  const [menuMode, setMenuMode] = useState<"primary" | "more">(isMoreRoute ? "more" : "primary");

  useEffect(() => {
    if (MORE_PATHS.some((p) => path === p || path.startsWith(`${p}/`))) {
      setMenuMode("more");
    } else if (PRIMARY_NAV.some((p) => path === p.href || path === "/app")) {
      setMenuMode("primary");
    }
  }, [path]);

  const active = (h: string) =>
    path === h ||
    path.startsWith(`${h}/`) ||
    (h === "/app/markets" && path === "/app");

  const items = menuMode === "primary" ? PRIMARY_NAV : MORE_NAV;

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-50 border-b border-line bg-[#0A0B0D]/[0.97] backdrop-blur-[14px]">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex items-center gap-6 lg:gap-8">
            <Logo href="/" />
            {/* Desktop Animated Pill Switcher */}
            <div className="hidden items-center md:flex">
              <motion.nav
                layout
                transition={{ type: "spring", stiffness: 420, damping: 34 }}
                className={`relative flex items-center gap-1 overflow-hidden rounded-full border p-1 transition-colors duration-300 ${
                  menuMode === "more"
                    ? "border-lime/35 bg-surface-2/95 shadow-[0_0_30px_-10px_rgba(200,245,96,0.28)]"
                    : "border-line-2 bg-surface/75"
                }`}
              >
                <AnimatePresence mode="popLayout" initial={false}>
                  <motion.div
                    key={menuMode}
                    initial={{ opacity: 0, x: menuMode === "more" ? 28 : -28, filter: "blur(4px)" }}
                    animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
                    exit={{ opacity: 0, x: menuMode === "more" ? -28 : 28, filter: "blur(4px)" }}
                    transition={{ type: "spring", stiffness: 440, damping: 32 }}
                    className="flex items-center gap-1"
                  >
                    {items.map((n, idx) => (
                      <motion.div
                        key={n.href}
                        initial={{ opacity: 0, y: 6, scale: 0.94 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        transition={{ delay: idx * 0.03, type: "spring", stiffness: 460, damping: 30 }}
                      >
                        <Link
                          href={n.href}
                          className={`relative inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
                            active(n.href) ? "text-bg" : "text-dim hover:text-ink"
                          }`}
                        >
                          {active(n.href) && (
                            <motion.span
                              layoutId="nav-pill"
                              className="absolute inset-0 rounded-full bg-lime"
                              transition={{ type: "spring", stiffness: 420, damping: 34 }}
                            />
                          )}
                          <span className="relative">{n.label}</span>
                          {n.badge && (
                            <span
                              className={`num relative rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${
                                active(n.href)
                                  ? "bg-bg/20 text-bg"
                                  : "border border-lime/30 bg-lime/10 text-lime"
                              }`}
                            >
                              {n.badge}
                            </span>
                          )}
                        </Link>
                      </motion.div>
                    ))}
                  </motion.div>
                </AnimatePresence>

                <div className="mx-0.5 h-4 w-px bg-line-2" />

                <motion.button
                  layout
                  type="button"
                  onClick={() => setMenuMode((m) => (m === "primary" ? "more" : "primary"))}
                  aria-expanded={menuMode === "more"}
                  className={`group relative inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition-all ${
                    menuMode === "more"
                      ? "bg-ink text-bg hover:bg-lime"
                      : isMoreRoute
                      ? "border border-lime/40 bg-lime/15 text-lime hover:bg-lime/25"
                      : "text-dim hover:bg-surface-2 hover:text-ink"
                  }`}
                >
                  <motion.span
                    animate={{ rotate: menuMode === "more" ? 90 : 0 }}
                    transition={{ type: "spring", stiffness: 360, damping: 24 }}
                    className="inline-flex"
                  >
                    <MoreIcon open={menuMode === "more"} />
                  </motion.span>
                  <span>{menuMode === "more" ? "Close" : "More"}</span>
                  {menuMode === "primary" && (
                    <span className="live-dot h-1.5 w-1.5 rounded-full bg-lime" />
                  )}
                </motion.button>
              </motion.nav>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Status />
            <WalletButton compact />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 pb-28 pt-6 sm:px-6 sm:pt-8 md:pb-16">{children}</main>

      {/* Mobile animated 5-slot dock */}
      <motion.nav
        layout
        className={`fixed inset-x-3 bottom-[max(12px,env(safe-area-inset-bottom))] z-40 flex items-center justify-around overflow-hidden rounded-2xl border p-1.5 shadow-[0_10px_30px_-10px_rgba(0,0,0,.55)] backdrop-blur-md transition-colors duration-300 md:hidden ${
          menuMode === "more"
            ? "border-lime/40 bg-surface-2/95"
            : "border-line-2 bg-surface/90"
        }`}
      >
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div
            key={menuMode}
            initial={{ opacity: 0, x: menuMode === "more" ? 36 : -36 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: menuMode === "more" ? -36 : 36 }}
            transition={{ type: "spring", stiffness: 420, damping: 32 }}
            className="flex flex-1 items-center justify-around"
          >
            {items.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className={`relative flex min-h-12 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl py-1.5 text-[10px] font-medium ${
                  active(n.href) ? "text-bg" : "text-dim"
                }`}
              >
                {active(n.href) && (
                  <motion.span
                    layoutId="tab-pill"
                    className="absolute inset-0 rounded-xl bg-lime"
                    transition={{ type: "spring", stiffness: 420, damping: 34 }}
                  />
                )}
                <span className="relative">
                  <Icon d={n.icon} />
                </span>
                <span className="relative truncate px-1">{n.label}</span>
              </Link>
            ))}
          </motion.div>
        </AnimatePresence>

        <button
          type="button"
          onClick={() => setMenuMode((m) => (m === "primary" ? "more" : "primary"))}
          aria-expanded={menuMode === "more"}
          className={`relative ml-1 flex min-h-12 min-w-[60px] flex-col items-center justify-center gap-0.5 rounded-xl px-2 py-1.5 text-[10px] font-semibold transition-colors ${
            menuMode === "more"
              ? "bg-ink text-bg"
              : isMoreRoute
              ? "border border-lime/40 bg-lime/15 text-lime"
              : "text-dim hover:text-ink"
          }`}
        >
          <motion.span
            animate={{ rotate: menuMode === "more" ? 90 : 0 }}
            transition={{ type: "spring", stiffness: 360, damping: 24 }}
          >
            <MoreIcon open={menuMode === "more"} />
          </motion.span>
          <span>{menuMode === "more" ? "Close" : "More"}</span>
        </button>
      </motion.nav>
    </div>
  );
}
