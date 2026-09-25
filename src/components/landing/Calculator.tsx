"use client";
import { useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { useMarkets } from "../useMarkets";
import RollingNumber from "../RollingNumber";
import { SELL_DISCOUNT } from "@/lib/markets";
import { pct, usd, units } from "@/lib/format";
import { useSpotlight } from "../useSpotlight";

export default function Calculator() {
  const [amt, setAmt] = useState(100);
  const [played, setPlayed] = useState(0);
  const { get } = useMarkets();
  const spy = get("SPYx");
  const y = spy?.trailingYield ?? 0;
  const px = spy?.xPrice ?? 0;
  const divUnits = amt * y;
  const divUsd = divUnits * px;
  const cash = divUsd * (1 - SELL_DISCOUNT);
  const spot = useSpotlight(0);
  const cashStr = px ? cash.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }) : "$0.00";

  return (
    <section className="relative mx-auto max-w-6xl px-6 py-28">
      <div className="grid items-end gap-6 md:grid-cols-2">
        <div>
          <div className="micro text-lime">Try it</div>
          <h2 className="display h2 mt-5">Price your coupon <em className="text-lime">in ten seconds.</em></h2>
        </div>
        <p className="max-w-md text-dim md:justify-self-end">Live SPYx price on Solana. Yield taken from the last 12 months of real SPYx multiplier bumps on Solana, nothing assumed.</p>
      </div>

      <div {...spot} className="card spot mt-12 grid overflow-hidden md:grid-cols-[1.1fr_1fr]">
        <div className="relative border-b border-line p-7 sm:p-10 md:border-b-0 md:border-r">
          <div className="flex items-baseline justify-between">
            <label htmlFor="amt" className="micro text-dim">SPYx you hold</label>
            <div className="num text-4xl text-ink sm:text-5xl">{amt}</div>
          </div>
          <input id="amt" type="range" min={1} max={500} value={amt} onChange={(e) => setAmt(Number(e.target.value))} className="mt-8" style={{ ["--fill" as string]: `${((amt - 1) / 499) * 100}%` }} />
          <div className="num mt-3 flex justify-between text-[11px] text-faint"><span>1</span><span>250</span><span>500</span></div>

          <div className="mt-10 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line">
            {[
              ["Position value", usd(amt * px)],
              ["Trailing yield, onchain", pct(y, 3)],
              ["12m dividend units", `${units(divUnits, 5)} SPYx`],
              ["12m dividend value", usd(divUsd)],
            ].map(([a, b]) => (
              <div key={a} className="bg-surface p-4">
                <div className="micro !text-[9px] text-dim">{a}</div>
                <div className="num mt-2 text-lg text-ink">{b}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="relative flex flex-col justify-between p-7 sm:p-10">
          <div>
            <div className="micro text-lime">You receive today</div>
            <div className="mt-4 text-[40px] text-lime sm:text-[52px]"><RollingNumber value={cashStr} /></div>
            <div className="mt-3 text-sm text-dim">After an {Math.round(SELL_DISCOUNT * 100)}% discount to fair value. You keep {amt} pSPYx and all price exposure.</div>
          </div>
          <div className="relative mt-10 h-24">
            <AnimatePresence mode="popLayout">
              <motion.div key={played} className="absolute inset-0 flex items-center justify-center gap-0">
                <motion.div initial={{ x: 0, rotate: 0 }} animate={{ x: played ? -18 : 0, rotate: played ? -3 : 0 }} transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }} className="flex h-20 w-32 flex-col justify-between rounded-l-xl border border-line-2 bg-surface-2 p-3">
                  <span className="micro !text-[8px] text-share">Share</span>
                  <span className="display text-xl">pSPYx</span>
                </motion.div>
                <div className="perf-v h-20 w-0" />
                <motion.div initial={{ x: 0, rotate: 0 }} animate={{ x: played ? 18 : 0, rotate: played ? 3 : 0 }} transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }} className={`flex h-20 w-28 flex-col justify-between rounded-r-xl border p-3 ${played ? "border-lime bg-lime text-bg shadow-[0_0_40px_-6px_rgba(200,245,96,.5)]" : "border-lime/30 bg-[#12170e] text-lime"}`}>
                  <span className="micro !text-[8px]">Coupon</span>
                  <span className="display text-xl">dSPYx</span>
                </motion.div>
              </motion.div>
            </AnimatePresence>
          </div>
          <div className="mt-8 flex flex-wrap gap-3">
            <button onClick={() => setPlayed((p) => p + 1)} className="btn btn-lime h-[52px] px-7">Split and sell <span className="arr">→</span></button>
            <Link href={`/app/split?x=SPYx&amt=${amt}`} className="btn btn-line h-[52px] px-6">Do it in the app</Link>
          </div>
        </div>
      </div>
    </section>
  );
}
