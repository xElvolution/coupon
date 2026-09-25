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
    <header className={`fixed inset-x-0 top-0 z-50 transition-all duration-500 ${solid ? "border-b border-line bg-bg/60 backdrop-blur-[14px]" : "border-b border-transparent"}`}>
      <div className="mx-auto flex h-[68px] max-w-7xl items-center justify-between px-5 sm:px-8">
        <Logo />
        <nav className="hidden items-center gap-8 text-sm text-dim md:flex">
          <a href="#trade" className="transition-colors hover:text-ink">How it works</a>
          <a href="#price" className="transition-colors hover:text-ink">Calculator</a>
          <a href="#proof" className="transition-colors hover:text-ink">Chain proof</a>
          <Link href="/app/markets" className="transition-colors hover:text-ink">Markets</Link>
        </nav>
        <Link href="/app" className="btn btn-lime h-10 px-5 text-sm">Open app <span className="arr">→</span></Link>
      </div>
    </header>
  );
}
