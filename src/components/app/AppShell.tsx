"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import Logo from "../Logo";
import { short } from "@/lib/format";

const NAV = [
  { href: "/app/markets", label: "Markets", mLabel: "Markets" },
  { href: "/app/split", label: "Split", mLabel: "Split" },
  { href: "/app/trade", label: "Trade", mLabel: "Trade" },
  { href: "/app/perps", label: "Perps", mLabel: "Perps" },
  { href: "/app/outcomes", label: "Outcomes", mLabel: "Outcomes" },
  { href: "/app/pyth", label: "Pyth Pro", mLabel: "Pyth" },
  { href: "/app/portfolio", label: "Portfolio", mLabel: "Portfolio" },
  { href: "/app/replay", label: "Replay", mLabel: "Replay" },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const { publicKey, disconnect, connected } = useWallet();
  const { setVisible } = useWalletModal();
  return (
    <div className="min-h-screen pb-24 md:pb-16">
      <header className="sticky top-0 z-40 border-b border-line bg-[#0A0B0D]/[0.97] backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6">
          <div className="flex items-center gap-5 lg:gap-7">
            <Logo />
            <nav className="hidden items-center gap-0.5 md:flex">
              {NAV.map((n) => {
                const on = path === n.href || path?.startsWith(n.href + "/");
                return (
                  <Link
                    key={n.href}
                    href={n.href}
                    className={`relative rounded-full px-3 py-1.5 text-[13px] transition-colors lg:px-3.5 ${
                      on ? "text-ink font-medium" : "text-dim hover:text-ink"
                    }`}
                  >
                    {n.label}
                    {on && <span className="absolute inset-x-3 -bottom-[15px] h-[2px] bg-lime" />}
                  </Link>
                );
              })}
            </nav>
          </div>
          <div className="flex items-center gap-2 sm:gap-2.5">
            <span className="hidden items-center gap-2 rounded-full border border-line-2 px-3 py-1 text-xs text-dim xl:inline-flex">
              <span className="dot-live" />Mainnet data · Devnet vault
            </span>
            <Link
              href="/app/faucet"
              className={`btn h-9 px-3 text-xs sm:px-3.5 ${
                path === "/app/faucet" ? "btn-lime" : "btn-line"
              }`}
            >
              Faucet
            </Link>
            {connected && publicKey ? (
              <button
                onClick={() => disconnect()}
                className="btn btn-line num h-9 px-3 text-xs sm:px-3.5"
                title="Disconnect"
              >
                {short(publicKey.toBase58(), 4, 4)}
              </button>
            ) : (
              <button
                onClick={() => setVisible(true)}
                className="btn btn-lime h-9 px-3.5 text-xs sm:px-4"
              >
                Connect
              </button>
            )}
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 pt-6 sm:px-6 sm:pt-10">{children}</main>
      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-6 border-t border-line bg-[#0A0B0D]/[0.97] pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden">
        {NAV.slice(0, 6).map((n) => {
          const on = path === n.href;
          return (
            <Link
              key={n.href}
              href={n.href}
              className={`relative flex h-14 items-center justify-center text-[11px] font-medium ${
                on ? "text-lime" : "text-dim"
              }`}
            >
              {on && <span className="absolute inset-x-2 top-0 h-[2px] bg-lime" />}
              {n.mLabel}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
