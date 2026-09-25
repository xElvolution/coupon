"use client";
import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { useMarkets } from "../useMarkets";
import { Stub, nextMonths } from "../TearCard";
import { Rosette } from "../Guilloche";
import { SELL_DISCOUNT } from "@/lib/markets";

gsap.registerPlugin(ScrollTrigger, useGSAP);

const BEATS = [
  { k: "01", t: "Hold", b: "100 SPYx in your wallet. The dividends are real, but they arrive as multiplier bumps you cannot spend." },
  { k: "02", t: "Split", b: "The vault tears it in two. pSPYx keeps the shares. dSPYx carries every bump for the next 12 months." },
  { k: "03", t: "Sell", b: "Sell the coupon stubs to a buyer for cash today. Your exposure to the index stays exactly where it was." },
];

const fmt = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function HoldSplitSell() {
  const root = useRef<HTMLDivElement>(null);
  const { get } = useMarkets();
  const spy = get("SPYx");
  const vals = useRef({ value: 0, est: 0, cash: 0 });
  const renderRef = useRef<() => void>(() => {});
  vals.current.value = spy?.xPrice ? spy.xPrice * 100 : 0;
  vals.current.est = spy?.xPrice ? spy.xPrice * 100 * spy.trailingYield : 0;
  vals.current.cash = vals.current.est * (1 - SELL_DISCOUNT);
  const months = nextMonths();
  const ready = !!spy?.xPrice;
  useEffect(() => {
    renderRef.current();
    if (ready) requestAnimationFrame(() => ScrollTrigger.refresh());
  }, [ready, spy?.xPrice]);
  useEffect(() => {
    document.fonts?.ready.then(() => ScrollTrigger.refresh());
  }, []);
  const bumpMonths = new Set((spy?.bumps ?? []).map((b) => new Date(b.at).getUTCMonth()));

  useGSAP(
    () => {
      const q = gsap.utils.selector(root);
      const p = { est: 0, cash: 0, coins: 0 };
      const render = () => {
        const v = vals.current;
        const e = q(".hs-est")[0], c = q(".hs-cash")[0], h = q(".hs-value")[0];
        if (h) h.textContent = v.value ? fmt(v.value) : "…";
        if (e) e.textContent = v.est ? fmt(v.est) : "…";
        if (c) c.textContent = v.cash ? fmt(v.cash * p.cash) : "…";
      };
      renderRef.current = render;
      const setBeat = (i: number) => q(".hs-beat").forEach((el, j) => el.classList.toggle("is-on", i === j));
      render();
      setBeat(0);
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (reduce) {
        p.est = 1; p.cash = 1; render(); setBeat(2);
        gsap.set(q(".hs-share"), { x: -20 });
        return;
      }
      const sm = () => window.innerWidth < 640;
      const stack = () => q(".hs-stack")[0].getBoundingClientRect();
      const tl = gsap.timeline({
        defaults: { ease: "none" },
        scrollTrigger: {
          trigger: q(".hs-pin")[0],
          // scrubbed across natural scroll, no pin spacer, so the page never shows an empty gap
          start: "top 70%",
          end: "bottom 45%",
          scrub: 0.6,
          onUpdate: (st) => setBeat(st.progress < 0.25 ? 0 : st.progress < 0.7 ? 1 : 2),
          invalidateOnRefresh: true,
        },
      });
      tl.to({}, { duration: 0.1 })
        .to(q(".hs-cutline"), { scaleY: 1, duration: 0.08 })
        .to(q(".hs-share"), { x: () => (sm() ? 0 : -24), y: () => (sm() ? -8 : 0), rotate: () => (sm() ? -0.6 : -1.5), duration: 0.25, ease: "power2.out" }, ">")
        .to(q(".hs-coupon"), { x: () => (sm() ? 0 : 24), y: () => (sm() ? 8 : 0), rotate: () => (sm() ? 0.6 : 1.5), duration: 0.25, ease: "power2.out" }, "<")
        .to(q(".hs-cutline"), { opacity: 0, duration: 0.05 }, "<")
        .to(p, { est: 1, duration: 0.25, onUpdate: render }, "<")
        .to({}, { duration: 0.08 })
        .to(q(".hs-coupon .stub"), {
          x: (_i: number, el: Element) => { const r = el.getBoundingClientRect(), s = stack(); return s.left + s.width / 2 - (r.left + r.width / 2); },
          y: (_i: number, el: Element) => { const r = el.getBoundingClientRect(), s = stack(); return s.top + 10 - (r.top + r.height / 2); },
          scale: 0.35, opacity: 0, rotate: 25, duration: 0.12, stagger: 0.022, ease: "power1.in",
        })
        .to(q(".hs-coin"), { scaleY: 1, opacity: 1, duration: 0.05, stagger: 0.022 }, "<+0.08")
        .to(p, { cash: 1, duration: 0.36, onUpdate: render }, "<")
        .to({}, { duration: 0.06 });
    },
    { scope: root, dependencies: [] },
  );

  return (
    <section ref={root} className="relative">
      <div className="hs-pin relative flex min-h-screen items-center overflow-hidden py-20">
        <div className="graph pointer-events-none absolute inset-0" />
        <div className="relative mx-auto grid w-full max-w-6xl items-center gap-12 px-6 lg:grid-cols-[0.9fr_1.1fr]">
          <div>
            <div className="micro text-lime">The trade in three beats</div>
            <h2 className="display h2 mt-5">Hold. Split. <em className="text-lime">Sell.</em></h2>
            <div className="mt-10 space-y-1">
              {BEATS.map((b) => (
                <div key={b.k} className="hs-beat group relative rounded-2xl border border-transparent p-4 opacity-40 transition-all duration-500 [&.is-on]:border-line [&.is-on]:bg-surface/60 [&.is-on]:opacity-100">
                  <div className="flex items-baseline gap-4">
                    <span className="num text-xs text-lime">{b.k}</span>
                    <span className="display text-3xl">{b.t}</span>
                  </div>
                  <p className="mt-2 max-w-md pl-9 text-[15px] leading-relaxed text-dim">{b.b}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="card relative overflow-hidden p-5 sm:p-7">
            <div className="grid grid-cols-3 gap-3 border-b border-line pb-5">
              <div><div className="micro !text-[9px] text-dim">100 SPYx value</div><div className="hs-value num mt-2 text-base text-ink sm:text-xl">…</div></div>
              <div><div className="micro !text-[9px] text-dim">12m dividends</div><div className="hs-est num mt-2 text-base text-ink sm:text-xl">…</div></div>
              <div><div className="micro !text-[9px] text-lime">Cash today</div><div className="hs-cash num mt-2 text-base text-lime sm:text-xl">…</div></div>
            </div>
            <div className="relative mt-7 flex flex-col gap-0 sm:flex-row">
              <div className="hs-share relative w-full rounded-t-2xl border sm:w-[55%] sm:rounded-l-2xl sm:rounded-tr-none border-line-2 bg-surface-2 p-4">
                <div className="micro !text-[9px] text-share">Share</div>
                <div className="display mt-3 text-4xl sm:text-5xl">pSPYx</div>
                <div className="num mt-2 text-xs text-dim">100.0000 units</div>
                <div className="num mt-6 text-[10px] text-faint">Exposure unchanged</div>
              </div>
              <div className="relative h-0 sm:h-auto sm:w-0">
                <div className="perf-h absolute -top-1 left-0 right-0 h-2 sm:hidden" />
                <div className="perf-v absolute -left-1 bottom-0 top-0 hidden w-2 sm:block" />
                <div className="hs-cutline absolute bottom-0 left-[-1px] top-0 hidden w-[2px] origin-top scale-y-0 bg-lime shadow-[0_0_14px_#c8f560] sm:block" />
              </div>
              <div className="hs-coupon relative w-full overflow-hidden rounded-b-2xl border sm:w-[45%] sm:rounded-r-2xl sm:rounded-bl-none border-lime/30 bg-[#12170e] p-3">
                <Rosette size={260} spin className="pointer-events-none absolute -right-16 -top-10 text-lime" opacity={0.1} />
                <div className="micro relative !text-[9px] text-lime">dSPYx · 12 stubs</div>
                <div className="relative mt-2 grid grid-cols-6 gap-1 sm:grid-cols-3">
                  {months.map((m, i) => <Stub key={i} label={m.label} year={m.year} div={bumpMonths.has(m.m)} className="h-[34px]" />)}
                </div>
              </div>
            </div>
            <div className="mt-6 flex items-end justify-between">
              <div className="text-xs text-dim">Live SPYx price × trailing onchain yield, {Math.round(SELL_DISCOUNT * 100)}% seller discount.</div>
              <div className="hs-stack relative flex h-[76px] w-[64px] flex-col-reverse items-center">
                {Array.from({ length: 12 }, (_, i) => (
                  <div key={i} className="hs-coin -mt-[1px] h-[6px] w-[56px] origin-bottom scale-y-0 rounded-[3px] border border-lime/40 bg-lime/80 opacity-0" />
                ))}
                <div className="micro absolute -bottom-5 !text-[8px] text-dim">USDC</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
