"use client";
import { useRef } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import SiteNav from "@/components/landing/SiteNav";
import TearCard from "@/components/TearCard";
import ProofStrip from "@/components/landing/ProofStrip";
import HoldSplitSell from "@/components/landing/HoldSplitSell";
import Calculator from "@/components/landing/Calculator";
import ChainProof from "@/components/landing/ChainProof";
import WhoBuys from "@/components/landing/WhoBuys";
import Faq from "@/components/landing/Faq";
import Reveal from "@/components/landing/Reveal";
import MagneticLink from "@/components/landing/MagneticLink";
import { Rosette } from "@/components/Guilloche";
import { Mark } from "@/components/Logo";
import { useMarkets } from "@/components/useMarkets";
import { usd, pct, ago } from "@/lib/format";
import Link from "next/link";

gsap.registerPlugin(useGSAP);

export default function Home() {
  const hero = useRef<HTMLDivElement>(null);
  const { get } = useMarkets();
  const spy = get("SPYx");

  useGSAP(
    () => {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      const tl = gsap.timeline({ defaults: { ease: "power4.out" } });
      tl.from(".h-line > span", { yPercent: 110, duration: 1, stagger: 0.08 })
        .from(".h-sub", { y: 24, opacity: 0, duration: 0.9, ease: "power3.out" }, 0.35)
        .from(".h-cta", { y: 24, opacity: 0, duration: 0.9, ease: "power3.out" }, 0.5)
        .from(".h-meta", { opacity: 0, duration: 1 }, 0.9);
    },
    { scope: hero },
  );

  return (
    <main className="overflow-x-clip">
      <SiteNav />

      {/* HERO */}
      <section ref={hero} className="relative min-h-[100svh] pt-[92px]">
        <div className="graph pointer-events-none absolute inset-0" />
        <Rosette size={1100} spin className="pointer-events-none absolute -right-[380px] -top-[300px] text-lime" opacity={0.05} rings={6} />
        <div className="relative mx-auto max-w-7xl px-5 sm:px-8">
          <div className="h-meta flex items-center gap-3">
            <span className="rounded-full border border-line-2 px-3 py-1"><span className="micro !text-[10px] text-dim">xStocks · Solana</span></span>
            <span className="micro !text-[10px] text-faint">Dividend stripping for tokenized equities</span>
          </div>
          <h1 className="display h1 mt-6 font-[340]">
            <span className="h-line block overflow-hidden pb-[0.06em]"><span className="block">Sell next year&apos;s</span></span>
            <span className="h-line block overflow-hidden pb-[0.1em]"><span className="block italic text-lime">dividends today.</span></span>
          </h1>

          <div className="mt-8 grid items-center gap-12 pb-16 lg:grid-cols-[0.8fr_1.2fr] lg:gap-10">
            <div>
              <p className="h-sub max-w-md text-[17px] leading-relaxed text-dim">
                COUPON tears your SPYx into a share token and a 12 month dividend coupon. Keep the stock. Sell the income for cash today, or buy someone else&apos;s below fair value.
              </p>
              <div className="h-cta mt-8 flex max-w-[24rem] flex-col gap-3 sm:max-w-none sm:flex-row">
                <MagneticLink href="/app/split" className="btn btn-lime h-[52px] px-7 text-[15px]">Split my SPYx <span className="arr">→</span></MagneticLink>
                <a href="#trade" className="btn btn-line h-[52px] px-6 text-[15px]">See how coupons pay</a>
              </div>
              <div className="h-meta mt-10 grid max-w-md grid-cols-3 gap-4 border-t border-line pt-5">
                <div><div className="num text-lg text-ink">{usd(spy?.xPrice)}</div><div className="micro mt-1 !text-[9px] text-faint">SPYx · Pyth {spy?.xPublish ? ago(spy.xPublish) : ""}</div></div>
                <div><div className="num text-lg text-lime">{pct(spy?.trailingYield, 3)}</div><div className="micro mt-1 !text-[9px] text-faint">Yield · onchain</div></div>
                <div><div className="num text-lg text-ink">{spy?.multiplier?.toFixed(5) ?? "…"}</div><div className="micro mt-1 !text-[9px] text-faint">Multiplier</div></div>
              </div>
            </div>
            <TearCard />
          </div>
        </div>
      </section>

      <ProofStrip />
      <div id="trade"><HoldSplitSell /></div>
      <div id="price"><Calculator /></div>
      <ChainProof />
      <WhoBuys />

      {/* trust row */}
      <section className="border-y border-line">
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-px bg-line md:grid-cols-5">
          {[
            ["Solana", "Settlement layer"],
            ["xStocks by Backed", "SPYx, AAPLx and more"],
            ["Pyth", "Equity and xStock prices"],
            ["Token-2022", "Scaled UI multiplier"],
            ["Devnet vault", "Paper ledger today"],
          ].map(([a, b]) => (
            <div key={a} className="bg-bg px-5 py-7">
              <div className="micro !text-[10px] text-ink">{a}</div>
              <div className="mt-1.5 text-xs text-faint">{b}</div>
            </div>
          ))}
        </div>
      </section>

      <Faq />

      {/* closing */}
      <section className="mx-auto max-w-6xl px-6 pb-10">
        <Reveal>
          <div className="card relative overflow-hidden px-8 py-20 text-center sm:py-28">
            <Rosette size={760} spin className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-lime" opacity={0.07} rings={6} />
            <div className="relative">
              <h2 className="display mx-auto max-w-4xl text-[clamp(2.6rem,6.5vw,5.6rem)] leading-[0.95]">Your next four dividends, <em className="text-lime">in hand today.</em></h2>
              <p className="mx-auto mt-6 max-w-lg text-dim">Connect Phantom, split SPYx and price the coupon against real Pyth and chain data.</p>
              <div className="mx-auto mt-10 flex max-w-[24rem] flex-col justify-center gap-3 sm:max-w-none sm:flex-row">
                <MagneticLink href="/app/split" className="btn btn-lime h-[52px] px-7 text-[15px]">Split my SPYx <span className="arr">→</span></MagneticLink>
                <Link href="/app/markets" className="btn btn-line h-[52px] px-6 text-[15px]">Browse markets</Link>
              </div>
            </div>
          </div>
        </Reveal>
      </section>

      <footer className="relative overflow-hidden pt-16">
        <div className="mx-auto grid max-w-6xl gap-10 px-6 sm:grid-cols-3">
          <div>
            <div className="flex items-center gap-2.5"><Mark /><span className="display text-xl">Coupon</span></div>
            <p className="mt-4 max-w-xs text-sm text-dim">Principal and dividend split for xStocks on Solana.</p>
          </div>
          <div className="text-sm">
            <div className="micro !text-[10px] text-faint">Product</div>
            <div className="mt-4 flex flex-col gap-2 text-dim">
              <Link href="/app/markets" className="hover:text-ink">Markets</Link>
              <Link href="/app/split" className="hover:text-ink">Split</Link>
              <Link href="/app/trade" className="hover:text-ink">Trade dividends</Link>
              <Link href="/app/replay" className="hover:text-ink">Replay</Link>
            </div>
          </div>
          <div className="text-sm">
            <div className="micro !text-[10px] text-faint">Data</div>
            <div className="mt-4 flex flex-col gap-2 text-dim">
              <a href="/api/markets" className="hover:text-ink">Markets API</a>
              <a href="/api/chain?x=SPYx" className="hover:text-ink">SPYx chain read</a>
              <a href="https://solscan.io/token/XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W" target="_blank" rel="noreferrer" className="hover:text-ink">SPYx on Solscan</a>
            </div>
          </div>
        </div>
        <div className="micro mx-auto mt-14 max-w-6xl px-6 !text-[10px] text-faint">Built for Stocklana · Prices Pyth · Multipliers Solana mainnet · Vault paper ledger on devnet release</div>
        <div aria-hidden className="display pointer-events-none mt-6 select-none text-center text-[clamp(6rem,24vw,22rem)] leading-[0.8]" style={{ marginBottom: "-0.14em", background: "linear-gradient(180deg, rgba(200,245,96,.16), transparent 85%)", WebkitBackgroundClip: "text", color: "transparent" }}>COUPON</div>
      </footer>
    </main>
  );
}
