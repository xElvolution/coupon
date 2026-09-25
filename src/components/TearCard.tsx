"use client";
import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { Rosette, WaveBand } from "./Guilloche";
import { useMarkets } from "./useMarkets";
import { usd, short } from "@/lib/format";

gsap.registerPlugin(useGSAP);

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
export function nextMonths(n = 12) {
  const d = new Date();
  return Array.from({ length: n }, (_, i) => {
    const m = (d.getUTCMonth() + 1 + i) % 12;
    const y = d.getUTCFullYear() + Math.floor((d.getUTCMonth() + 1 + i) / 12);
    return { m, label: MONTHS[m], year: String(y).slice(2) };
  });
}

export function Stub({ label, year, div, active, className = "" }: { label: string; year: string; div: boolean; active?: boolean; className?: string }) {
  return (
    <div className={`stub relative flex flex-col justify-between rounded-[7px] border px-2 py-1.5 transition-colors duration-300 ${active ? "border-lime bg-lime text-bg" : div ? "border-lime/45 bg-lime/[0.07] text-ink" : "border-line-2 bg-white/[0.015] text-dim"} ${className}`}>
      <div className="flex items-center justify-between">
        <span className="num text-[9px] tracking-[0.12em]">{label}</span>
        <span className={`num text-[8px] ${active ? "text-bg/70" : "text-faint"}`}>{year}</span>
      </div>
      <div className="flex items-center justify-between">
        <span className={`h-1.5 w-1.5 rounded-full ${div ? (active ? "bg-bg" : "bg-lime") : "bg-transparent"}`} />
        <span className="num text-[8px] opacity-70">{div ? "DIV" : ""}</span>
      </div>
    </div>
  );
}

export default function TearCard() {
  const root = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(-1);
  const [torn, setTorn] = useState(false);
  const { get } = useMarkets();
  const spy = get("SPYx");
  const bumpMonths = new Set((spy?.bumps ?? []).map((b) => new Date(b.at).getUTCMonth()));
  const months = nextMonths();

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(
        { desktop: "(min-width: 768px)", mobile: "(max-width: 767px)", reduce: "(prefers-reduced-motion: reduce)" },
        (ctx) => {
          const { desktop, reduce } = ctx.conditions as { desktop: boolean; reduce: boolean };
          const dx = desktop ? 26 : 0, dy = desktop ? 0 : 16;
          if (reduce) {
            gsap.set(".tc-share", { x: -dx, y: -dy, rotate: desktop ? -2 : 0 });
            gsap.set(".tc-coupon", { x: dx, y: dy, rotate: desktop ? 2 : 0 });
            gsap.set(".tc-cut", { scaleX: 1, scaleY: 1, opacity: 0 });
            setTorn(true);
            return;
          }
          const tl = gsap.timeline({ delay: 0.6 });
          tl.from(".tc-wrap", { y: 40, opacity: 0, duration: 1, ease: "power4.out" }, 0)
            .fromTo(".tc-cut", desktop ? { scaleY: 0 } : { scaleX: 0 }, { ...(desktop ? { scaleY: 1 } : { scaleX: 1 }), duration: 0.55, ease: "power2.inOut" }, 0.55)
            .to(".tc-cut", { opacity: 0, duration: 0.3 }, 1.15)
            .to(".tc-share", { x: -dx, y: -dy, rotate: desktop ? -2.2 : -0.6, duration: 1, ease: "power4.out" }, 1.05)
            .to(".tc-coupon", { x: dx, y: dy, rotate: desktop ? 2.2 : 0.6, duration: 1, ease: "power4.out", onStart: () => setTorn(true) }, 1.05)
            .from(".tc-coupon .stub", { scale: 0.7, opacity: 0, duration: 0.5, ease: "back.out(2)", stagger: 0.035 }, 1.2);
          // idle breathe
          gsap.to(".tc-share-in", { y: 4, duration: 3, ease: "sine.inOut", yoyo: true, repeat: -1, delay: 2.2 });
          gsap.to(".tc-coupon-in", { y: -4, duration: 3.4, ease: "sine.inOut", yoyo: true, repeat: -1, delay: 2.2 });
        },
      );
    },
    { scope: root },
  );

  useEffect(() => {
    if (!torn || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => setActive((a) => (a + 1) % 12), 1000);
    return () => clearInterval(t);
  }, [torn]);

  return (
    <div ref={root} className="relative mx-auto w-full max-w-[640px]">
      <div className="tc-wrap relative flex flex-col md:flex-row">
        {/* share half */}
        <div className="tc-share relative z-10 md:w-[58%]">
          <div className="tc-share-in relative h-full overflow-hidden rounded-t-[18px] border border-line-2 bg-[linear-gradient(160deg,#1a1d22,#111317)] p-2 md:rounded-l-[18px] md:rounded-tr-none">
            <div className="relative h-full rounded-[12px] border border-share/25 px-5 pb-5 pt-4">
              <WaveBand className="pointer-events-none absolute inset-x-0 top-0 h-9 w-full text-share" opacity={0.18} />
              <Rosette size={260} className="pointer-events-none absolute -right-20 -top-10 text-share" opacity={0.12} rings={4} />
              <div className="relative flex items-center justify-between">
                <span className="micro text-share">Tokenized equity</span>
                <span className="num text-[10px] text-faint">{spy ? short(spy.mint, 4, 4) : "XsoC…DF2W"}</span>
              </div>
              <div className="relative mt-5 h-[64px] sm:h-[78px]">
                <div className={`display absolute inset-0 text-[60px] leading-none transition-all duration-700 sm:text-[76px] ${torn ? "translate-y-2 opacity-0" : "opacity-100"}`}>SPYx</div>
                <div className={`display absolute inset-0 text-[60px] leading-none text-share transition-all duration-700 sm:text-[76px] ${torn ? "opacity-100" : "-translate-y-2 opacity-0"}`}>pSPYx</div>
              </div>
              <div className="relative mt-1 text-sm text-dim">{torn ? "Share token. Keeps the base units." : "SP500 xStock · 100.0000 units"}</div>
              <div className="relative mt-5 grid grid-cols-2 gap-3 border-t border-dashed border-line-2 pt-4">
                <div>
                  <div className="micro !text-[9px] text-faint">Multiplier</div>
                  <div className="num mt-1 text-sm text-ink">{spy?.multiplier?.toFixed(6) ?? "…"}</div>
                </div>
                <div>
                  <div className="micro !text-[9px] text-faint">SPYx price</div>
                  <div className="num mt-1 text-sm text-ink">{usd(spy?.xPrice)}</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* perforation */}
        <div className="relative z-20 h-0 md:h-auto md:w-0">
          <div className="perf-h absolute -top-1 left-0 right-0 h-2 md:hidden" />
          <div className="perf-v absolute -left-1 bottom-0 top-0 hidden w-2 md:block" />
          <div className="tc-cut absolute left-0 right-0 top-0 h-[2px] origin-left bg-lime shadow-[0_0_14px_#c8f560] md:bottom-0 md:left-[-1px] md:right-auto md:h-auto md:w-[2px] md:origin-top" />
        </div>

        {/* coupon half */}
        <div className="tc-coupon relative md:w-[42%]">
          <div className={`tc-coupon-in relative h-full overflow-hidden rounded-b-[18px] border border-lime/30 bg-[linear-gradient(160deg,#151a10,#0e1013)] p-3 transition-shadow duration-700 md:rounded-r-[18px] md:rounded-bl-none ${torn ? "shadow-[0_0_60px_-10px_rgba(200,245,96,.35)]" : ""}`}>
            <Rosette size={340} spin className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-lime" opacity={0.1} rings={5} />
            <div className="relative flex items-center justify-between px-1">
              <span className="micro text-lime">dSPYx</span>
              <span className="micro !text-[9px] text-dim">12 month coupon</span>
            </div>
            <div className="relative mt-3 grid grid-cols-6 gap-1.5 md:grid-cols-3">
              {months.map((mo, i) => (
                <Stub key={i} label={mo.label} year={mo.year} div={bumpMonths.has(mo.m)} active={i === active} className="h-[44px] md:h-[46px]" />
              ))}
            </div>
            <div className="relative mt-2 flex items-center justify-end gap-1.5 whitespace-nowrap px-1 text-[9px] text-faint"><span className="h-1.5 w-1.5 rounded-full bg-lime" /><span className="num">bumped last year</span></div>
            <div className="relative mt-2 flex items-end justify-between px-1">
              <div>
                <div className="micro !text-[9px] text-dim">Cash today</div>
                <div className="num text-lg text-lime">{usd(spy?.bid != null ? spy.bid * 100 : null)}</div>
                <div className="text-[10px] leading-tight text-dim">for 100 SPYx, based on last year&apos;s payouts</div>
              </div>

            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
