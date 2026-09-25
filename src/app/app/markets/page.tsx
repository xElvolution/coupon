"use client";
import Link from "next/link";
import { motion } from "framer-motion";
import { useMarkets } from "@/components/useMarkets";
import { PageHead, TokenDot } from "@/components/app/ui";
import { usd, pct, ago, srcLabel, dateUTC } from "@/lib/format";
import { useSpotlight } from "@/components/useSpotlight";

export default function Markets() {
  const { data, loading, error } = useMarkets();
  const ms = data?.markets ?? [];
  const spy = ms.find((m) => m.x === "SPYx");
  const paying = ms.filter((m) => m.trailingYield > 0);
  const s = useSpotlight(0);
  const last = spy?.bumps?.length ? spy.bumps[spy.bumps.length - 1] : null;
  return (
    <div>
      <PageHead kicker="Markets" title="Dividend coupons," accent="priced live." sub="Every xStock with a dividend stream gets a 12 month coupon. Fair value is the live xStock price times the multiplier growth of the last 12 months." right={<div className="num text-xs text-dim">{data ? `Updated ${ago(Math.floor(data.at / 1000))}` : loading ? "Loading" : ""}{error ? " · partial data" : ""}</div>} />

      {/* mobile: proof that the numbers are real, one tap from the onchain replay */}
      <div className="card relative mt-6 overflow-hidden p-5 md:hidden">
        <div className="pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full bg-lime/10 blur-2xl" />
        <div className="flex items-center justify-between gap-3">
          <span className="micro !text-[9px] text-lime">Proof · Solana mainnet</span>
          <span className="num text-[10px] text-faint">{last ? dateUTC(last.at) : "…"}</span>
        </div>
        <div className="mt-3 text-sm text-dim">Last real SPYx dividend bump</div>
        <div className="num mt-1 text-[32px] leading-none text-ink">
          {last ? `+${(100 * (last.next / last.prev - 1)).toFixed(4)}` : "…"}
          <span className="ml-2 text-base text-dim">units per 100</span>
        </div>
        <div className="num mt-2 text-xs text-faint">{last ? `multiplier ${last.prev.toFixed(6)} → ${last.next.toFixed(6)}` : "reading the mint"}</div>
        <Link href="/app/replay?x=SPYx" className="btn btn-lime mt-4 h-11 w-full text-sm">Verify on chain <span className="arr">→</span></Link>
      </div>

      <div className="mt-4 grid gap-4 md:mt-8 md:grid-cols-3">
        <div {...s} className="card spot relative overflow-hidden p-6 md:col-span-2">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              {spy && <TokenDot m={spy} size={44} />}
              <div>
                <div className="display text-3xl">dSPYx</div>
                <div className="text-sm text-dim">S&amp;P 500 · highest onchain dividend stream</div>
              </div>
            </div>
            <Link href="/app/trade?x=SPYx" className="btn btn-lime h-11 px-5 text-sm md:h-10">Trade <span className="arr">→</span></Link>
          </div>
          <div className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-4">
            {[
              ["SPYx · live", usd(spy?.xPrice)],
              ["Trailing yield", pct(spy?.trailingYield, 3)],
              ["Coupon bid", usd(spy?.bid, 3)],
              ["Coupon ask", usd(spy?.ask, 3)],
            ].map(([a, b], i) => (
              <div key={a} className="bg-surface p-4"><div className="micro !text-[9px] text-dim">{a}</div><div className={`num mt-2 text-xl ${i === 3 ? "text-lime" : "text-ink"}`}>{b}</div></div>
            ))}
          </div>
        </div>
        <div className="card p-6">
          <div className="micro !text-[9px] text-dim">Coverage</div>
          <div className="num mt-3 text-5xl text-ink">{paying.length || "…"}<span className="text-2xl text-faint">/{ms.length || "…"}</span></div>
          <div className="mt-2 text-sm text-dim">xStocks with real multiplier bumps in the last 12 months.</div>
          <div className="mt-6 space-y-2 text-xs">
            <div className="flex justify-between"><span className="text-dim">Prices</span><span className="num">{spy?.priceSource === "pyth" ? "Pyth Hermes" : "Jupiter live + Pyth"}</span></div>
            <div className="flex justify-between"><span className="text-dim">Multipliers</span><span className="num">Solana mainnet</span></div>
            <div className="flex justify-between"><span className="text-dim">Vault</span><span className="num text-share">Devnet program</span></div>
          </div>
        </div>
      </div>

      <div className="card mt-4 overflow-hidden">
        <div className="hidden grid-cols-[1.6fr_1fr_1fr_1fr_0.9fr_1fr_1fr_1.1fr] gap-3 border-b border-line px-6 py-3 lg:grid">
          {["Asset", "Live price", "Pyth feed", "Multiplier", "Yield 12m", "Coupon bid", "Coupon ask", ""].map((h) => <div key={h} className="micro !text-[9px] text-faint">{h}</div>)}
        </div>
        {(ms.length ? ms : Array.from({ length: 6 }, () => null)).map((m, i) => (
          <motion.div key={m?.x ?? i} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i * 0.035, 0.25), duration: 0.35 }} className="grid grid-cols-2 items-center gap-3 border-b border-line px-6 py-4 transition-colors last:border-0 hover:bg-surface-2/60 lg:grid-cols-[1.6fr_1fr_1fr_1fr_0.9fr_1fr_1fr_1.1fr]">
            <div className="col-span-2 flex items-center gap-3 lg:col-span-1">
              {m ? <TokenDot m={m} /> : <span className="h-9 w-9 animate-pulse rounded-full bg-surface-2" />}
              <div><div className="num text-[15px] text-ink">{m?.x ?? "…"}</div><div className="text-xs text-dim">{m?.name ?? "Loading"}</div></div>
            </div>
            <Cell l="Live price" v={usd(m?.xPrice)} sub={m ? srcLabel(m.priceSource) : undefined} />
            <Cell l="Pyth feed" v={usd(m?.pythX)} sub={m?.pythXPublish ? `updated ${dateUTC(m.pythXPublish)}` : undefined} />
            <Cell l="Multiplier" v={m?.multiplier?.toFixed(6) ?? "…"} />
            <Cell l="Yield 12m" v={m ? (m.trailingYield > 0 ? pct(m.trailingYield, 3) : "None") : "…"} accent={!!m && m.trailingYield > 0} />
            <Cell l="Coupon bid" v={m && m.trailingYield > 0 ? usd(m.bid, 3) : "…"} />
            <Cell l="Coupon ask" v={m && m.trailingYield > 0 ? usd(m.ask, 3) : "…"} />
            <div className="col-span-2 flex justify-end gap-2 lg:col-span-1">
              {m && m.trailingYield > 0 ? (
                <>
                  <Link href={`/app/replay?x=${m.x}`} className="inline-flex h-11 items-center px-2 text-xs text-dim underline decoration-line-2 underline-offset-4 hover:text-lime md:h-9">Verify</Link>
                  <Link href={`/app/split?x=${m.x}`} className="btn btn-line h-11 px-4 text-xs md:h-9 md:px-3.5">Split</Link>
                  <Link href={`/app/trade?x=${m.x}`} className="btn btn-lime h-11 px-4 text-xs md:h-9 md:px-3.5">Trade</Link>
                </>
              ) : m ? <span className="text-xs text-faint">No dividend stream</span> : null}
            </div>
          </motion.div>
        ))}
      </div>
      <p className="mt-4 text-xs text-faint">Coupon price per d token = live xStock price (Jupiter on Solana, or Pyth Hermes when keyed) × trailing 12 month multiplier growth. The Pyth feed column shows the last value published to the Pyth price account on Solana. Bid is 8% under fair value, ask is 5% under. Multiplier history from the xStocks public API, current multiplier read from each mint on Solana mainnet.</p>
    </div>
  );
}

function Cell({ l, v, accent, sub }: { l: string; v: string; accent?: boolean; sub?: string }) {
  return (
    <div>
      <div className="micro !text-[9px] text-faint lg:hidden">{l}</div>
      <div className={`num text-sm ${accent ? "text-lime" : "text-ink"}`}>{v}</div>
      {sub && <div className="num text-[10px] text-faint">{sub}</div>}
    </div>
  );
}
