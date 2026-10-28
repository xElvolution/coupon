"use client";
import Sk from "@/components/Sk";
import { useMounted } from "@/components/useMounted";
import Link from "next/link";
import { motion } from "framer-motion";
import { useMarkets } from "@/components/useMarkets";
import { PageHead, TokenDot } from "@/components/app/ui";
import { usd, pct, ago, srcLabel, dateUTC } from "@/lib/format";
import { useSpotlight } from "@/components/useSpotlight";

export default function Markets() {
  const mounted = useMounted();
  const { data, loading, error } = useMarkets();
  const ms = data?.markets ?? [];
  const spy = ms.find((m) => m.x === "SPYx");
  const paying = ms.filter((m) => m.trailingYield > 0);
  const s = useSpotlight(0);
  const last = spy?.bumps?.length ? spy.bumps[spy.bumps.length - 1] : null;
  return (
    <div>
      <PageHead
        kicker="Markets · Spot Coupons · Dividend Perps · pm-AMM Outcomes"
        title="Dividend coupons,"
        accent="priced live."
        sub="Every xStock with a dividend stream gets a 12 month coupon, a 20x Dividend Yield Perpetual, and binary Outcome Markets anchored by 27 live Pyth PriceUpdateV2 feeds and Solana mainnet Token-2022 multipliers."
        right={
          <div className="num text-xs text-dim">
            {data ? `Updated ${mounted ? ago(Math.floor(data.at / 1000)) : "just now"}` : loading ? "Loading" : ""}
            {error ? " · partial data" : ""}
          </div>
        }
      />

      {/* mobile: proof that the numbers are real, one tap from the onchain replay */}
      <div className="card relative mt-6 overflow-hidden p-5 md:hidden">
        <div className="pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full bg-lime/10 blur-2xl" />
        <div className="flex items-center justify-between gap-3">
          <span className="micro !text-[9px] text-lime">Proof · Solana mainnet</span>
          <span className="num text-[10px] text-faint">{last ? dateUTC(last.at) : <Sk />}</span>
        </div>
        <div className="mt-3 flex items-center gap-2 text-sm text-dim">
          {spy && <TokenDot m={spy} size={22} />}Last real SPYx dividend bump
        </div>
        <div className="num mt-1 text-[32px] leading-none text-ink">
          {last ? `+${(100 * (last.next / last.prev - 1)).toFixed(4)}` : <Sk />}
          <span className="ml-2 text-base text-dim">units per 100</span>
        </div>
        <div className="num mt-2 text-xs text-faint">
          {last ? `multiplier ${last.prev.toFixed(6)} → ${last.next.toFixed(6)}` : "reading the mint"}
        </div>
        <Link href="/app/replay?x=SPYx" className="btn btn-lime mt-4 h-11 w-full text-sm">
          Verify on chain <span className="arr">→</span>
        </Link>
      </div>

      <div className="mt-4 grid gap-4 md:mt-8 md:grid-cols-3">
        <div {...s} className="card spot relative overflow-hidden p-6 md:col-span-2">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              {spy && <TokenDot m={spy} size={44} badge="d" />}
              <div>
                <div className="display text-3xl">dSPYx</div>
                <div className="text-sm text-dim">S&amp;P 500 · highest onchain dividend stream</div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href="/app/perps?x=SPYx" className="btn btn-line h-11 px-4 text-sm md:h-10">
                Trade 20x Perp
              </Link>
              <Link href="/app/trade?x=SPYx" className="btn btn-lime h-11 px-5 text-sm md:h-10">
                Trade Coupon <span className="arr">→</span>
              </Link>
            </div>
          </div>
          <div className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-4">
            {[
              ["SPYx · live", usd(spy?.xPrice)],
              ["Trailing yield", pct(spy?.trailingYield, 3)],
              ["Coupon bid", usd(spy?.bid, 3)],
              ["Coupon ask", usd(spy?.ask, 3)],
            ].map(([a, b], i) => (
              <div key={a} className="bg-surface p-4">
                <div className="micro !text-[9px] text-dim">{a}</div>
                <div className={`num mt-2 text-xl ${i === 3 ? "text-lime" : "text-ink"}`}>{b}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="card p-6">
          <div className="micro !text-[9px] text-dim">Coverage &amp; Telemetry</div>
          <div className="num mt-3 text-5xl text-ink">
            {paying.length || <Sk />}
            <span className="text-2xl text-faint">/{ms.length || <Sk />}</span>
          </div>
          <div className="mt-2 text-sm text-dim">xStocks with real multiplier bumps and active Dividend Perps.</div>
          <div className="mt-6 space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-dim">Pyth Oracles</span>
              <span className="num text-lime">27 PriceUpdateV2 Feeds</span>
            </div>
            <div className="flex justify-between">
              <span className="text-dim">Multipliers</span>
              <span className="num">Solana Mainnet + Pyth .RR</span>
            </div>
            <div className="flex justify-between">
              <span className="text-dim">Settlement</span>
              <span className="num text-share">Devnet Vault + vAMM + pm-AMM</span>
            </div>
          </div>
        </div>
      </div>

      {/* 3 Institutional Pillars Strip */}
      <div className="mt-4 grid gap-4 md:grid-cols-3">
        <Link href="/app/perps" className="card group p-5 transition-colors hover:border-lime/50">
          <div className="flex items-center justify-between">
            <span className="micro !text-[9px] text-lime">Pillar 1 · Dividend Perps</span>
            <span className="num text-xs text-lime">Up to 20x →</span>
          </div>
          <div className="display mt-2 text-2xl text-ink group-hover:text-lime">Dividend Yield Perpetuals</div>
          <p className="mt-1 text-xs text-dim">
            Go long or short annualized Token-2022 dividend growth on `dSPYx-PERP`, `dMSFTx-PERP`, `dQQQx-PERP`, and `dAAPLx-PERP` with Pyth confidence-bounded leverage.
          </p>
        </Link>
        <Link href="/app/outcomes" className="card group p-5 transition-colors hover:border-lime/50">
          <div className="flex items-center justify-between">
            <span className="micro !text-[9px] text-lime">Pillar 2 · Outcome Markets</span>
            <span className="num text-xs text-lime">6 Active Contracts →</span>
          </div>
          <div className="display mt-2 text-2xl text-ink group-hover:text-lime">pm-AMM Prediction Markets</div>
          <p className="mt-1 text-xs text-dim">
            Binary YES/NO contracts on Q4 dividend multiplier bumps and Pyth `.RR` redemption parity, settled trustlessly by onchain state.
          </p>
        </Link>
        <Link href="/app/pyth" className="card group p-5 transition-colors hover:border-lime/50">
          <div className="flex items-center justify-between">
            <span className="micro !text-[9px] text-lime">Pillar 3 · Pyth Pro Telemetry</span>
            <span className="num text-xs text-lime">27 Live Feeds →</span>
          </div>
          <div className="display mt-2 text-2xl text-ink group-hover:text-lime">Pyth Intelligence &amp; Strip</div>
          <p className="mt-1 text-xs text-dim">
            Sub-second 50ms US Equity, 200ms xStock, and 200ms `.RR` Redemption Rate feeds with 3M to 24M implied dividend yield curves.
          </p>
        </Link>
      </div>

      <div className="card mt-4 overflow-hidden">
        <div className="hidden grid-cols-[1.5fr_0.95fr_0.95fr_0.95fr_0.85fr_0.9fr_0.9fr_1.4fr] gap-3 border-b border-line px-6 py-3 lg:grid">
          {["Asset", "Live price", "Pyth feed", "Multiplier", "Yield 12m", "Coupon bid", "Coupon ask", ""].map((h) => (
            <div key={h} className="micro !text-[9px] text-faint">
              {h}
            </div>
          ))}
        </div>
        {(ms.length ? ms : Array.from({ length: 6 }, () => null)).map((m, i) => (
          <motion.div
            key={m?.x ?? i}
            initial={{ y: 14 }}
            animate={{ y: 0 }}
            transition={{ delay: Math.min(i * 0.035, 0.25), duration: 0.35 }}
            className="grid grid-cols-2 items-center gap-3 border-b border-line px-6 py-4 transition-colors last:border-0 hover:bg-surface-2/60 lg:grid-cols-[1.5fr_0.95fr_0.95fr_0.95fr_0.85fr_0.9fr_0.9fr_1.4fr]"
          >
            <div className="col-span-2 flex items-center gap-3 lg:col-span-1">
              {m ? <TokenDot m={m} badge="d" /> : <span className="h-9 w-9 animate-pulse rounded-full bg-surface-2" />}
              <div>
                <div className="num text-[15px] text-ink">{m?.x ?? <Sk />}</div>
                <div className="text-xs text-dim">{m?.name ?? "Loading"}</div>
              </div>
            </div>
            <Cell l="Live price" v={usd(m?.xPrice)} sub={m ? srcLabel(m.priceSource) : undefined} />
            <Cell l="Pyth feed" v={usd(m?.pythX)} sub={m?.pythXPublish ? `updated ${dateUTC(m.pythXPublish)}` : undefined} />
            <Cell
              l="Multiplier"
              v={m?.multiplier?.toFixed(6) ?? <Sk />}
              sub={m?.rrPrice ? `Pyth .RR ${m.rrPrice.toFixed(4)}x` : undefined}
            />
            <Cell
              l="Yield 12m"
              v={m ? (m.trailingYield > 0 ? pct(m.trailingYield, 3) : "None") : <Sk />}
              accent={!!m && m.trailingYield > 0}
            />
            <Cell l="Coupon bid" v={m ? (m.trailingYield > 0 ? usd(m.bid, 3) : "None") : <Sk />} />
            <Cell l="Coupon ask" v={m ? (m.trailingYield > 0 ? usd(m.ask, 3) : "None") : <Sk />} />
            <div className="col-span-2 flex flex-wrap justify-end gap-1.5 lg:col-span-1">
              {m && m.trailingYield > 0 ? (
                <>
                  <Link
                    href={`/app/replay?x=${m.x}`}
                    className="inline-flex h-11 items-center px-1.5 text-xs text-dim underline decoration-line-2 underline-offset-4 hover:text-lime md:h-9"
                  >
                    Verify
                  </Link>
                  <Link href={`/app/perps?x=${m.x}`} className="btn btn-line h-11 px-3 text-xs md:h-9">
                    Perp
                  </Link>
                  <Link href={`/app/split?x=${m.x}`} className="btn btn-line h-11 px-3 text-xs md:h-9">
                    Split
                  </Link>
                  <Link href={`/app/trade?x=${m.x}`} className="btn btn-lime h-11 px-3.5 text-xs md:h-9">
                    Trade
                  </Link>
                </>
              ) : m ? (
                <Link href={`/app/pyth?x=${m.x}`} className="text-xs text-dim underline decoration-line-2 underline-offset-4 hover:text-lime">
                  Pyth Telemetry →
                </Link>
              ) : null}
            </div>
          </motion.div>
        ))}
      </div>
      <p className="mt-4 text-xs text-faint">
        Coupon price per d token = live xStock price (Jupiter on Solana, or Pyth Hermes when keyed) × trailing 12 month multiplier growth. The Pyth feed column shows the last value published to the Pyth PriceUpdateV2 account on Solana, paired with the Pyth .RR redemption rate feed. Bid is 8% under fair value, ask is 5% under.
      </p>
    </div>
  );
}

function Cell({ l, v, accent, sub }: { l: string; v: React.ReactNode; accent?: boolean; sub?: string }) {
  return (
    <div>
      <div className="micro !text-[9px] text-faint lg:hidden">{l}</div>
      <div className={`num text-sm ${accent ? "text-lime" : "text-ink"}`}>{v}</div>
      {sub && <div className="num text-[10px] text-faint">{sub}</div>}
    </div>
  );
}
