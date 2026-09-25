"use client";
import { motion } from "framer-motion";
import Link from "next/link";
import { useMarkets } from "../useMarkets";
import { dateUTC, pct, units, usd, short } from "@/lib/format";
import Reveal from "./Reveal";
import { useSpotlight } from "../useSpotlight";

export default function ChainProof() {
  const { get } = useMarkets();
  const spy = get("SPYx");
  const bumps = spy?.bumps ?? [];
  const maxStep = Math.max(...bumps.map((b) => b.next / b.prev - 1), 0.0001);
  const last = bumps[bumps.length - 1];
  const s = useSpotlight(0);
  return (
    <section id="proof" className="relative border-y border-line bg-bg-2 py-28">
      <div className="mx-auto max-w-6xl px-6">
        <Reveal className="grid items-end gap-6 md:grid-cols-[1.2fr_1fr]">
          <div>
            <div className="micro text-lime">Chain proof</div>
            <h2 className="display h2 mt-5">Every coupon traces back to <em className="text-lime">a number onchain.</em></h2>
          </div>
          <p className="text-dim md:justify-self-end">We read the SPYx mint on Solana mainnet and its Token-2022 scaled UI amount config. Each dividend is a multiplier bump. A dSPYx holder receives exactly the units each bump adds.</p>
        </Reveal>

        <div className="mt-14 grid gap-px overflow-hidden rounded-[20px] border border-line bg-line md:grid-cols-3">
          {[
            ["Multiplier now", spy?.multiplier?.toFixed(9) ?? "…", spy ? `Mint ${short(spy.mint, 4, 4)} · mainnet` : "Reading mainnet"],
            ["Delivered since launch", pct(spy?.sinceLaunch, 3), `${bumps.length || "…"} dividend bumps, net of withholding`],
            ["Last bump, 100 SPYx", last ? `+${units(100 * (last.next / last.prev - 1), 8)}` : "…", last ? `${dateUTC(last.at)} · ${usd(spy?.xPrice ? spy.xPrice * 100 * (last.next / last.prev - 1) : null)} at today's price` : "…"],
          ].map(([a, b, c]) => (
            <div key={a} className="bg-surface p-7">
              <div className="micro !text-[9px] text-dim">{a}</div>
              <div className="num mt-3 text-2xl text-ink sm:text-[28px]">{b}</div>
              <div className="mt-2 text-sm text-faint">{c}</div>
            </div>
          ))}
        </div>

        <Reveal delay={0.05}>
          <div {...s} className="card spot mt-5 p-7 sm:p-9">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <div className="micro !text-[9px] text-dim">SPYx multiplier history</div>
                <div className="display mt-2 text-3xl">What a dSPYx holder collected</div>
              </div>
              <Link href="/app/replay" className="btn btn-line h-10 px-5 text-sm">Open replay <span>→</span></Link>
            </div>
            <div className="mt-10 grid h-56 grid-cols-4 items-end gap-4 sm:gap-10">
              {(bumps.length ? bumps : [null, null, null, null]).map((b, i) => {
                const step = b ? b.next / b.prev - 1 : 0;
                return (
                  <div key={i} className="flex h-full flex-col justify-end">
                    <div className="num mb-2 text-center text-xs text-lime">{b ? `+${units(100 * step, 4)}` : ""}</div>
                    <motion.div initial={{ height: 0 }} whileInView={{ height: b ? `${(step / maxStep) * 76}%` : "6%" }} viewport={{ once: true }} transition={{ duration: 1.1, delay: 0.12 * i, ease: [0.16, 1, 0.3, 1] }} className="rounded-t-md bg-gradient-to-t from-lime/30 to-lime" />
                    <div className="num mt-3 border-t border-line pt-2 text-center text-[11px] text-dim">{b ? dateUTC(b.at) : "…"}</div>
                  </div>
                );
              })}
            </div>
            <div className="mt-6 text-xs text-faint">Units per 100 SPYx = 100 × (new ÷ previous − 1). History from the xStocks public multiplier API, current value verified against the mint account on Solana mainnet.</div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
