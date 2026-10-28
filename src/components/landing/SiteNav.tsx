"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import Logo from "../Logo";

export default function SiteNav() {
  const [solid, setSolid] = useState(false);
  useEffect(() => {
    const f = () => setSolid(window.scrollY > 24);
    f();
    window.addEventListener("scroll", f, { passive: true });
    return () => window.removeEventListener("scroll", f);
  }, []);
  return (
    <header className={`fixed inset-x-0 top-0 z-50 transition-all duration-500 border-b ${solid ? "border-line" : "border-line/60"} bg-[#0A0B0D]/[0.97] backdrop-blur-[14px]`}>
      <div className="mx-auto flex h-[68px] max-w-7xl items-center justify-between px-5 sm:px-8">
        <Logo />
        <nav className="hidden items-center gap-7 text-sm text-dim md:flex">
          <a href="#trade" className="transition-colors hover:text-ink">How it works</a>
          <Link href="/app/perps" className="transition-colors hover:text-ink">Dividend Perps</Link>
          <Link href="/app/outcomes" className="transition-colors hover:text-ink">Outcome Markets</Link>
          <Link href="/app/pyth" className="transition-colors hover:text-ink">Pyth Pro</Link>
          <Link href="/app/markets" className="transition-colors hover:text-ink">Markets</Link>
        </nav>
        <Link href="/app/markets" className="btn btn-lime h-11 px-5 text-sm md:h-10">Open app <span className="arr">→</span></Link>
      </div>
    </header>
  );
}
