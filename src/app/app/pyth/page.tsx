"use client";
import Sk from "@/components/Sk";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useMounted } from "@/components/useMounted";
import { useMarkets } from "@/components/useMarkets";
import { PageHead, TickerChips, TokenDot } from "@/components/app/ui";
import { usd, pct, ago, dateUTC, short } from "@/lib/format";
import { US_TREASURY_1Y_PCT } from "@/lib/markets";

function PythInner() {
  const sp = useSearchParams();
  const mounted = useMounted();
  const { data, loading, get } = useMarkets();
  const [x, setX] = useState(sp.get("x") ?? "SPYx");

  const ms = data?.markets ?? [];
  const active = get(x) ?? ms[0];
  const tel = active?.pythTelemetry;
  const eq = tel?.equityFeed ?? null;
  const xp = tel?.xFeed ?? null;
  const rr = tel?.rrFeed ?? null;

  return (
    <div className="pb-28 md:pb-0">
      <PageHead
        kicker="Pyth Pro · 27 Live Feeds · Solana Push Oracle"
        title="Pyth Intelligence,"
        accent="sub-second telemetry."
        sub="Every xStock market is anchored by three simultaneous Pyth PriceUpdateV2 feeds on Solana mainnet: 50ms US Equity spot, 200ms tokenized xStock spot, and 200ms Crypto Redemption Rate (.RR) cross-checked against Token-2022 ScaledUiAmountConfig."
        right={
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-2 rounded-full border border-lime/30 bg-lime/10 px-3 py-1 text-xs text-lime">
              <span className="dot-live" />
              {data?.pythSource === "hermes" ? "Pyth Pro Hermes" : "Pyth Push Oracle · Slot " + (data?.slot ? data.slot.toLocaleString() : "live")}
            </span>
            <span className="num rounded-full border border-line-2 bg-surface px-3 py-1 text-xs text-dim">
              Session · {data?.pythSession?.session ?? "EXTENDED"}
            </span>
          </div>
        }
      />

      {/* Top 4 institutional metrics */}
      <div className="mt-6 grid grid-cols-2 gap-3 sm:mt-8 sm:gap-4 lg:grid-cols-4">
        <div className="card p-4 sm:p-5">
          <div className="micro !text-[9px] text-dim">Active Pyth Feeds</div>
          <div className="num mt-2 text-2xl text-ink sm:text-3xl">27 <span className="text-sm text-lime">PriceUpdateV2</span></div>
          <div className="mt-1 text-xs text-faint">9 Equity (50ms) · 9 xStock (200ms) · 9 .RR</div>
        </div>
        <div className="card p-4 sm:p-5">
          <div className="micro !text-[9px] text-dim">Oracle Receiver Program</div>
          <div className="num mt-2 text-lg text-ink sm:text-xl">pythWSns...iRsT</div>
          <div className="mt-1 text-xs text-faint">
            <a
              href="https://explorer.solana.com/address/pythWSnswVUd12oZpeFP8e9CVaEqJg25g1Vtc2biRsT"
              target="_blank"
              rel="noreferrer"
              className="text-lime underline decoration-line-2 underline-offset-4"
            >
              Verify on Solana Mainnet ↗
            </a>
          </div>
        </div>
        <div className="card p-4 sm:p-5">
          <div className="micro !text-[9px] text-dim">{active?.x ?? "SPYx"} Peg Basis (xStock vs Equity)</div>
          <div className={`num mt-2 text-2xl sm:text-3xl ${Math.abs(tel?.pegBasisBps ?? 0) < 25 ? "text-lime" : "text-ink"}`}>
            {tel ? `${tel.pegBasisBps >= 0 ? "+" : ""}${tel.pegBasisBps.toFixed(1)} bps` : <Sk />}
          </div>
          <div className="mt-1 text-xs text-faint">
            Confidence · ±{tel?.combinedConfBps?.toFixed(2) ?? "0.00"} bps
          </div>
        </div>
        <div className="card p-4 sm:p-5">
          <div className="micro !text-[9px] text-dim">Pyth Leverage Guard</div>
          <div className="num mt-2 flex items-baseline gap-2 text-2xl text-lime sm:text-3xl">
            {tel ? `${tel.maxLeverage}x max` : <Sk />}
            <span className="rounded border border-lime/30 bg-lime/10 px-2 py-0.5 text-[10px] uppercase tracking-wider text-lime">
              {tel?.riskStatus ?? "NOMINAL"}
            </span>
          </div>
          <div className="mt-1 text-xs text-faint">Auto-caps leverage on conf or peg drift</div>
        </div>
      </div>

      {/* Asset selector */}
      <div className="mt-6">
        <TickerChips markets={ms} value={x} onChange={setX} />
      </div>

      {/* Tri-feed breakdown for selected asset */}
      {active && (
        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          {/* Feed 1: US Equity Spot */}
          <div className="card p-5 sm:p-6">
            <div className="flex items-center justify-between gap-2">
              <span className="micro !text-[9px] text-lime">1 · Pyth US Equity Spot</span>
              <span className="num rounded border border-line-2 px-2 py-0.5 text-[10px] text-dim">
                {eq?.channel ?? "fixed_rate@50ms"}
              </span>
            </div>
            <div className="mt-2 flex items-center justify-between">
              <div className="num text-sm text-dim">{active.equityFeedSymbol}</div>
              {eq?.account && (
                <a
                  href={`https://explorer.solana.com/address/${eq.account}`}
                  target="_blank"
                  rel="noreferrer"
                  className="num text-xs text-lime hover:underline"
                >
                  {short(eq.account, 5, 4)} ↗
                </a>
              )}
            </div>
            <div className="num mt-4 text-3xl text-ink">{usd(eq?.price)}</div>
            <div className="mt-4 space-y-2 border-t border-line pt-4 text-xs">
              <div className="flex justify-between">
                <span className="text-dim">Confidence interval</span>
                <span className="num text-ink">±{usd(eq?.conf, 4)} ({eq?.confBps?.toFixed(2) ?? "0"} bps)</span>
              </div>
              <div className="flex justify-between">
                <span className="text-dim">EMA price</span>
                <span className="num text-ink">{usd(eq?.emaPrice)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-dim">Posted slot</span>
                <span className="num text-dim">{eq?.postedSlot ? eq.postedSlot.toLocaleString() : "None"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-dim">Last publish</span>
                <span className="num text-dim">{eq?.publish ? (mounted ? ago(eq.publish) : dateUTC(eq.publish)) : "None"}</span>
              </div>
            </div>
          </div>

          {/* Feed 2: Tokenized xStock Spot */}
          <div className="card p-5 sm:p-6">
            <div className="flex items-center justify-between gap-2">
              <span className="micro !text-[9px] text-lime">2 · Pyth xStock Spot</span>
              <span className="num rounded border border-line-2 px-2 py-0.5 text-[10px] text-dim">
                {xp?.channel ?? "fixed_rate@200ms"}
              </span>
            </div>
            <div className="mt-2 flex items-center justify-between">
              <div className="num text-sm text-dim">{active.xFeedSymbol}</div>
              {xp?.account && (
                <a
                  href={`https://explorer.solana.com/address/${xp.account}`}
                  target="_blank"
                  rel="noreferrer"
                  className="num text-xs text-lime hover:underline"
                >
                  {short(xp.account, 5, 4)} ↗
                </a>
              )}
            </div>
            <div className="num mt-4 text-3xl text-ink">{usd(xp?.price ?? active.xPrice)}</div>
            <div className="mt-4 space-y-2 border-t border-line pt-4 text-xs">
              <div className="flex justify-between">
                <span className="text-dim">Confidence interval</span>
                <span className="num text-ink">±{usd(xp?.conf, 4)} ({xp?.confBps?.toFixed(2) ?? "0"} bps)</span>
              </div>
              <div className="flex justify-between">
                <span className="text-dim">EMA price</span>
                <span className="num text-ink">{usd(xp?.emaPrice)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-dim">Spot vs EMA spread</span>
                <span className="num text-lime">{tel ? `${tel.emaSpreadBps >= 0 ? "+" : ""}${tel.emaSpreadBps.toFixed(2)} bps` : "0 bps"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-dim">Peg basis vs Equity</span>
                <span className="num text-lime">{tel ? `${tel.pegBasisBps >= 0 ? "+" : ""}${tel.pegBasisBps.toFixed(2)} bps` : "0 bps"}</span>
              </div>
            </div>
          </div>

          {/* Feed 3: Pyth Redemption Rate (.RR) vs Token-2022 Multiplier */}
          <div className="card p-5 sm:p-6">
            <div className="flex items-center justify-between gap-2">
              <span className="micro !text-[9px] text-lime">3 · Pyth Redemption Rate (.RR)</span>
              <span className="num rounded border border-lime/30 bg-lime/10 px-2 py-0.5 text-[10px] text-lime">
                Dual-Oracle Proof
              </span>
            </div>
            <div className="mt-2 flex items-center justify-between">
              <div className="num text-sm text-dim">{active.rrFeedSymbol}</div>
              {rr?.account && (
                <a
                  href={`https://explorer.solana.com/address/${rr.account}`}
                  target="_blank"
                  rel="noreferrer"
                  className="num text-xs text-lime hover:underline"
                >
                  {short(rr.account, 5, 4)} ↗
                </a>
              )}
            </div>
            <div className="num mt-4 text-3xl text-lime">
              {rr ? `${rr.price.toFixed(6)}x` : active.multiplier ? `${active.multiplier.toFixed(6)}x` : <Sk />}
            </div>
            <div className="mt-4 space-y-2 border-t border-line pt-4 text-xs">
              <div className="flex justify-between">
                <span className="text-dim">Token-2022 Mint Multiplier</span>
                <span className="num text-ink">{active.multiplier ? `${active.multiplier.toFixed(6)}x` : "None"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-dim">Pyth .RR vs Mint Delta</span>
                <span className="num text-lime">{tel ? `${tel.rrVsMultBps.toFixed(2)} bps` : "0.00 bps"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-dim">12M Trailing Dividend Yield</span>
                <span className="num text-lime">{pct(active.trailingYield, 3)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-dim">Next Ex-Dividend Est.</span>
                <span className="num text-dim">{active.nextExDate} (+{active.quarterlyBpsEst} bps)</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Implied Dividend Yield Curve Strip (3M / 6M / 12M / 24M) */}
      {active && (
        <div className="mt-4 grid gap-4 lg:grid-cols-[1.35fr_1fr]">
          <div className="card p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="micro !text-[9px] text-lime">Forward Dividend Strip · {active.x}</div>
                <div className="display mt-1 text-2xl">Implied Dividend Yield Curve (3M to 24M)</div>
              </div>
              <span className="num text-xs text-dim">
                1Y US Treasury Benchmark · {US_TREASURY_1Y_PCT.toFixed(2)}%
              </span>
            </div>

            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {active.yieldCurve.map((c) => (
                <div key={c.tenor} className="rounded-2xl border border-line bg-bg/60 p-4">
                  <div className="flex items-center justify-between">
                    <span className="num text-sm font-medium text-ink">{c.tenor}</span>
                    <span className="num text-[11px] text-dim">{c.days}d</span>
                  </div>
                  <div className="num mt-3 text-2xl text-lime">
                    {c.impliedYieldPct > 0 ? `${c.impliedYieldPct.toFixed(3)}%` : "0.000%"}
                  </div>
                  <div className="mt-1 text-[11px] text-dim">
                    Forward div · <span className="num text-ink">{usd(c.forwardDivUsd, 3)}</span>
                  </div>
                  <div className="mt-3 space-y-1 border-t border-line pt-2 text-[11px]">
                    <div className="flex justify-between">
                      <span className="text-faint">Target mult</span>
                      <span className="num text-dim">{c.impliedMult.toFixed(5)}x</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-faint">Discount Z(T)</span>
                      <span className="num text-dim">{c.discountFactor.toFixed(5)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-faint">vs UST 1Y</span>
                      <span className="num text-share">{c.treasurySpreadBps} bps</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="card flex flex-col justify-between p-5 sm:p-6">
            <div>
              <div className="micro !text-[9px] text-share">Deterministic Risk Guard</div>
              <div className="display mt-1 text-2xl">Pyth Confidence &amp; Peg Engine</div>
              <p className="mt-2 text-sm text-dim">
                Coupon combines Pyth confidence intervals, Spot-vs-EMA spread, and `.RR` vs Token-2022 multiplier parity to dynamically bound perpetual leverage and protect vaults during extended and overnight equity sessions.
              </p>
              <div className="mt-5 space-y-2.5 text-xs">
                <div className="flex items-center justify-between rounded-xl border border-line bg-bg/50 px-3.5 py-2.5">
                  <span className="text-dim">Tier 1 · Conf ≤ 15 bps &amp; Drift ≤ 25 bps</span>
                  <span className="num text-lime">20x Max Leverage</span>
                </div>
                <div className="flex items-center justify-between rounded-xl border border-line bg-bg/50 px-3.5 py-2.5">
                  <span className="text-dim">Tier 2 · Conf ≤ 35 bps &amp; Drift ≤ 60 bps</span>
                  <span className="num text-ink">12x Max Leverage</span>
                </div>
                <div className="flex items-center justify-between rounded-xl border border-line bg-bg/50 px-3.5 py-2.5">
                  <span className="text-dim">Tier 3 · Conf ≤ 75 bps &amp; Drift ≤ 120 bps</span>
                  <span className="num text-share">8x Max Leverage</span>
                </div>
                <div className="flex items-center justify-between rounded-xl border border-line bg-bg/50 px-3.5 py-2.5">
                  <span className="text-dim">Tier 4 · High Volatility / Overnight Guard</span>
                  <span className="num text-dim">5x Max Leverage</span>
                </div>
              </div>
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              <Link href={`/app/perps?x=${active.x}`} className="btn btn-lime h-10 flex-1 text-xs">
                Trade d{active.x}-PERP <span className="arr">→</span>
              </Link>
              <Link href={`/app/outcomes?x=${active.x}`} className="btn btn-line h-10 flex-1 text-xs">
                Outcome Markets <span className="arr">→</span>
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Full 9-market x 3-feed Pyth Telemetry Matrix */}
      <div className="card mt-4 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-6 py-4">
          <div>
            <div className="display text-2xl">All 27 Live Pyth PriceUpdateV2 Feeds</div>
            <div className="text-xs text-dim">
              Direct onchain reads from Solana mainnet Push Oracle (`pythWSnswVUd12oZpeFP8e9CVaEqJg25g1Vtc2biRsT`) + Token-2022 mints
            </div>
          </div>
          <a
            href="/api/pyth"
            target="_blank"
            rel="noreferrer"
            className="btn btn-line h-9 px-3.5 text-xs"
          >
            Raw JSON Feed API ↗
          </a>
        </div>

        <div className="hidden grid-cols-[1.3fr_1fr_1fr_1fr_1fr_0.9fr_0.9fr_0.9fr] gap-3 border-b border-line px-6 py-3 lg:grid">
          {[
            "Asset",
            "US Equity (50ms)",
            "xStock (200ms)",
            "Peg Basis",
            "Pyth .RR Feed",
            "Token-2022 Mult",
            "Conf Band",
            "Max Lev",
          ].map((h) => (
            <div key={h} className="micro !text-[9px] text-faint">
              {h}
            </div>
          ))}
        </div>

        {(ms.length ? ms : Array.from({ length: 6 }, () => null)).map((m, i) => {
          const t = m?.pythTelemetry;
          return (
            <div
              key={m?.x ?? i}
              onClick={() => m && setX(m.x)}
              className={`grid cursor-pointer grid-cols-2 items-center gap-3 border-b border-line px-6 py-4 transition-colors last:border-0 hover:bg-surface-2/60 lg:grid-cols-[1.3fr_1fr_1fr_1fr_1fr_0.9fr_0.9fr_0.9fr] ${
                m?.x === x ? "bg-surface-2/40" : ""
              }`}
            >
              <div className="col-span-2 flex items-center gap-3 lg:col-span-1">
                {m ? <TokenDot m={m} badge="d" /> : <span className="h-9 w-9 animate-pulse rounded-full bg-surface-2" />}
                <div>
                  <div className="num text-[15px] text-ink">{m?.x ?? <Sk />}</div>
                  <div className="text-xs text-dim">{m?.name ?? (loading ? "Loading" : "")}</div>
                </div>
              </div>
              <div>
                <div className="micro !text-[8px] text-faint lg:hidden">US Equity</div>
                <div className="num text-sm text-ink">{usd(t?.equityFeed?.price ?? m?.equity)}</div>
                <div className="num text-[10px] text-faint">±{usd(t?.equityFeed?.conf, 3)}</div>
              </div>
              <div>
                <div className="micro !text-[8px] text-faint lg:hidden">xStock</div>
                <div className="num text-sm text-ink">{usd(t?.xFeed?.price ?? m?.xPrice)}</div>
                <div className="num text-[10px] text-faint">EMA {usd(t?.xFeed?.emaPrice)}</div>
              </div>
              <div>
                <div className="micro !text-[8px] text-faint lg:hidden">Peg Basis</div>
                <div className={`num text-sm ${Math.abs(t?.pegBasisBps ?? 0) <= 25 ? "text-lime" : "text-ink"}`}>
                  {t ? `${t.pegBasisBps >= 0 ? "+" : ""}${t.pegBasisBps.toFixed(1)} bps` : <Sk />}
                </div>
                <div className="num text-[10px] text-faint">EMA {t ? `${t.emaSpreadBps.toFixed(1)} bps` : ""}</div>
              </div>
              <div>
                <div className="micro !text-[8px] text-faint lg:hidden">Pyth .RR</div>
                <div className="num text-sm text-lime">{m?.rrPrice ? `${m.rrPrice.toFixed(6)}x` : <Sk />}</div>
                <div className="num text-[10px] text-faint">Δ {t ? `${t.rrVsMultBps.toFixed(2)} bps` : "0 bps"}</div>
              </div>
              <div>
                <div className="micro !text-[8px] text-faint lg:hidden">Token-2022</div>
                <div className="num text-sm text-ink">{m?.multiplier ? `${m.multiplier.toFixed(6)}x` : <Sk />}</div>
                <div className="num text-[10px] text-faint">{m && m.trailingYield > 0 ? pct(m.trailingYield, 2) : "0.00%"}</div>
              </div>
              <div>
                <div className="micro !text-[8px] text-faint lg:hidden">Conf Band</div>
                <div className="num text-sm text-ink">{t ? `±${t.combinedConfBps.toFixed(2)} bps` : <Sk />}</div>
                <div className="num text-[10px] text-faint">{t?.riskStatus ?? ""}</div>
              </div>
              <div className="flex items-center justify-between lg:justify-start">
                <span className="num rounded-full border border-lime/30 bg-lime/10 px-2.5 py-1 text-xs text-lime">
                  {t ? `${t.maxLeverage}x` : "None"}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function PythPage() {
  return (
    <Suspense fallback={<div className="card h-96 animate-pulse p-7" />}>
      <PythInner />
    </Suspense>
  );
}
