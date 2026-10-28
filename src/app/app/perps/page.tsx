"use client";
import Sk from "@/components/Sk";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useMarkets } from "@/components/useMarkets";
import { useVault } from "@/components/useVault";
import { ActionButton } from "@/components/app/ActionButton";
import { AmountField, PageHead, Row, Seg, TestNote, TickerChips, TokenDot, TxModal } from "@/components/app/ui";
import { units, usd, pct, short } from "@/lib/format";
import { USDC_DECIMALS, X_DECIMALS, fromRaw, toRaw } from "@/lib/vault/sdk";
import { explorerTx } from "@/lib/vault/deployment";

function PerpsInner() {
  const sp = useSearchParams();
  const { data, get } = useMarkets();
  const v = useVault();
  const [x, setX] = useState(sp.get("x") ?? "SPYx");
  const [side, setSide] = useState<"LONG" | "SHORT">(sp.get("side") === "SHORT" ? "SHORT" : "LONG");
  const [collateral, setCollateral] = useState("25");
  const [leverage, setLeverage] = useState(5);
  const [deskBusy, setDeskBusy] = useState(false);
  const [deskSig, setDeskSig] = useState<string | null>(null);

  const perpMarkets = (data?.markets ?? []).filter((k) => k.perp != null);
  const m = get(x) && get(x)?.perp ? get(x) : perpMarkets[0] ?? get("SPYx");
  const perp = m?.perp ?? null;
  const tel = m?.pythTelemetry ?? null;
  const cm = m ? v.markets[m.x] : undefined;

  const maxLev = perp?.maxLeverage ?? tel?.maxLeverage ?? 12;
  useEffect(() => {
    if (leverage > maxLev) setLeverage(maxLev);
  }, [maxLev, leverage]);

  const collatNum = Number(collateral) || 0;
  const notionalUsd = collatNum * leverage;
  const markPrice = perp?.markPriceUsd ?? m?.fair ?? 3.85;
  const indexPrice = perp?.indexPriceUsd ?? m?.fair ?? 3.83;
  const markYield = perp?.markYieldPct ?? (m ? m.trailingYield * 100 : 0.5715);
  const indexYield = perp?.indexYieldPct ?? (m ? m.trailingYield * 100 : 0.5715);
  const sizeContracts = markPrice > 0 ? notionalUsd / markPrice : 0;

  // Liquidation yield threshold
  const maintMargin = (perp?.maintenanceMarginPct ?? 4.0) / 100;
  const liqMoveFrac = Math.max(0.04, 1 / leverage - maintMargin);
  const liqYieldPct =
    side === "LONG"
      ? Math.max(0.01, markYield * (1 - liqMoveFrac))
      : markYield * (1 + liqMoveFrac);

  const cashMax = fromRaw(v.usdc, USDC_DECIMALS);
  const rawUsdc = toRaw(collatNum, USDC_DECIMALS);
  const hasPool = !!cm?.hasPool;
  const bad = !hasPool || collatNum <= 0 || (!!v.owner && collatNum > cashMax + 1e-9);

  const cta = !hasPool
    ? v.loaded
      ? `No pool for d${m?.x ?? "SPYx"}`
      : "Loading pool"
    : collatNum <= 0
    ? "Enter USDC collateral"
    : v.owner && collatNum > cashMax + 1e-9
    ? "Not enough test USDC"
    : `${side === "LONG" ? "Long" : "Short"} ${leverage}x d${m?.x ?? "SPYx"}-PERP · ${usd(notionalUsd)}`;

  const go = async () => {
    if (!v.vault || !v.owner || bad || !cm || !m || !perp) return;
    const ixs = v.vault.perpOrder(
      v.owner,
      cm.dep,
      side === "LONG" ? "long" : "short",
      rawUsdc,
      leverage
    );
    const ok = await v.run(
      `${side} ${leverage}x ${perp.symbol} (${usd(collatNum)} collateral)`,
      ixs,
      (sig) => ({
        action: "perp",
        symbol: m.x,
        badge: "d",
        sig,
        at: Date.now(),
        title: `${perp.symbol} ${side} ${leverage}x opened`,
        lines: [
          ["Contract", `${perp.symbol} (${side} ${leverage}x)`],
          ["Collateral", `${units(collatNum, 2)} test USDC`],
          ["Notional exposure", usd(notionalUsd, 2)],
          ["Entry mark yield", `${markYield.toFixed(4)}% (${usd(markPrice, 4)})`],
          ["Liquidation yield", `${liqYieldPct.toFixed(4)}%`],
        ],
      })
    );
    if (ok) setCollateral("25");
  };

  const verifiedPerps = (data?.verifiedOrders ?? []).filter((o) => o.kind === "perp");

  // Build synthetic vAMM yield orderbook around markYield
  const asks = [3, 2, 1].map((step) => {
    const y = markYield + step * 0.0035;
    const p = m?.xPrice ? (m.xPrice * y) / 100 : markPrice * (1 + step * 0.006);
    const sz = 420 + step * 310;
    return { yieldPct: y, price: p, sizeUsd: sz };
  });
  const bids = [1, 2, 3].map((step) => {
    const y = Math.max(0.01, markYield - step * 0.0035);
    const p = m?.xPrice ? (m.xPrice * y) / 100 : markPrice * (1 - step * 0.006);
    const sz = 460 + step * 290;
    return { yieldPct: y, price: p, sizeUsd: sz };
  });

  return (
    <div className="pb-32 md:pb-0">
      <PageHead
        kicker="Dividend Yield Perpetuals · Pyth + Token-2022"
        title="Trade implied dividend yield,"
        accent="long or short up to 20x."
        sub="Go long or short the annualized dividend growth rate of tokenized equities without holding the underlying stock exposure. Index yield is anchored by Solana mainnet Token-2022 ScaledUiAmountConfig and guarded by Pyth Pro confidence intervals."
        right={
          <Link href={`/app/pyth?x=${m?.x ?? "SPYx"}`} className="btn btn-line h-9 px-3.5 text-xs">
            Pyth Risk Guard · {maxLev}x Max ↗
          </Link>
        }
      />

      {/* Top Perp Market Selector Strip */}
      <div className="mt-6">
        <TickerChips
          markets={perpMarkets}
          value={m?.x ?? "SPYx"}
          onChange={(nx) => setX(nx)}
        />
      </div>

      {/* Selected Perp Telemetry Ribbon */}
      {m && perp && (
        <div className="card mt-4 grid grid-cols-2 gap-px overflow-hidden bg-line sm:grid-cols-3 lg:grid-cols-6">
          <div className="bg-surface p-4">
            <div className="micro !text-[9px] text-dim">Contract</div>
            <div className="num mt-1.5 flex items-center gap-2 text-lg text-ink">
              <TokenDot m={m} size={22} badge="d" />
              {perp.symbol}
            </div>
            <div className="text-[11px] text-faint">{m.name}</div>
          </div>
          <div className="bg-surface p-4">
            <div className="micro !text-[9px] text-lime">Mark Yield / Price</div>
            <div className="num mt-1.5 text-lg text-lime">{perp.markYieldPct.toFixed(3)}%</div>
            <div className="num text-[11px] text-dim">{usd(perp.markPriceUsd, 4)} per unit</div>
          </div>
          <div className="bg-surface p-4">
            <div className="micro !text-[9px] text-dim">Oracle Index Yield</div>
            <div className="num mt-1.5 text-lg text-ink">{perp.indexYieldPct.toFixed(3)}%</div>
            <div className="num text-[11px] text-faint">Mult {m.multiplier?.toFixed(6) ?? "None"}x</div>
          </div>
          <div className="bg-surface p-4">
            <div className="micro !text-[9px] text-dim">8h Funding Rate</div>
            <div className={`num mt-1.5 text-lg ${perp.fundingRate8hBps >= 0 ? "text-lime" : "text-share"}`}>
              {perp.fundingRate8hBps >= 0 ? "+" : ""}
              {perp.fundingRate8hBps.toFixed(2)} bps
            </div>
            <div className="num text-[11px] text-faint">
              Next in {Math.floor(perp.nextFundingSecs / 3600)}h {Math.floor((perp.nextFundingSecs % 3600) / 60)}m
            </div>
          </div>
          <div className="bg-surface p-4">
            <div className="micro !text-[9px] text-dim">Open Interest</div>
            <div className="num mt-1.5 text-lg text-ink">{usd(perp.openInterestUsd, 0)}</div>
            <div className="num text-[11px] text-faint">24h Vol · {usd(perp.volume24hUsd, 0)}</div>
          </div>
          <div className="bg-surface p-4">
            <div className="micro !text-[9px] text-dim">Pyth Confidence Guard</div>
            <div className="num mt-1.5 text-lg text-lime">{perp.maxLeverage}x Max</div>
            <div className="num text-[11px] text-faint">
              ±{tel?.combinedConfBps.toFixed(2) ?? "3.50"} bps · {perp.riskStatus}
            </div>
          </div>
        </div>
      )}

      {/* Main Trading Grid: Left Order Ticket, Right Yield Orderbook + Curve & Mechanics */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[1.05fr_1fr]">
        {/* Left: Perp Order Ticket */}
        <div className="card p-5 sm:p-7">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Seg
              options={[
                ["LONG", "Long Yield (Bullish Divs)"],
                ["SHORT", "Short Yield (Hedge / Cut)"],
              ]}
              value={side}
              onChange={(s) => setSide(s)}
            />
            <span className="num text-xs text-dim">
              {v.owner ? `Balance · ${units(cashMax, 2)} USDC` : "Devnet vAMM + SPL Memo"}
            </span>
          </div>

          <div className="mt-5">
            <AmountField
              label="Collateral (test USDC)"
              value={collateral}
              onChange={setCollateral}
              max={cashMax}
              suffix="USDC"
            />
          </div>

          {/* Leverage Slider */}
          <div className="mt-5 rounded-2xl border border-line bg-bg/60 p-4">
            <div className="flex items-center justify-between">
              <span className="micro !text-[9px] text-dim">Leverage (Pyth Guard Cap · {maxLev}x)</span>
              <span className="num text-base font-medium text-lime">{leverage}x</span>
            </div>
            <input
              type="range"
              min={1}
              max={maxLev}
              step={1}
              value={leverage}
              onChange={(e) => setLeverage(Number(e.target.value))}
              className="mt-3 w-full accent-[#C8F560]"
            />
            <div className="mt-2 flex justify-between text-[11px] text-faint">
              {[1, 2, 5, 8, 12, 20]
                .filter((lv) => lv <= maxLev)
                .map((lv) => (
                  <button
                    key={lv}
                    type="button"
                    onClick={() => setLeverage(lv)}
                    className={`num rounded px-2 py-0.5 transition-colors ${
                      leverage === lv ? "bg-lime/20 text-lime" : "hover:text-ink"
                    }`}
                  >
                    {lv}x
                  </button>
                ))}
            </div>
          </div>

          {/* Order Summary */}
          <div className="mt-5 rounded-2xl border border-line bg-bg/60 p-4 sm:p-5">
            <div className="flex items-baseline justify-between">
              <span className="micro !text-[9px] text-dim">Notional Dividend Exposure</span>
              <span className="micro !text-[9px] text-lime">
                {side === "LONG" ? "Profits when div yield rises" : "Profits when div yield drops"}
              </span>
            </div>
            <div className="num mt-2 text-3xl text-ink sm:text-4xl">
              {usd(notionalUsd, 2)}
              <span className="ml-2 text-sm text-dim">
                ({units(sizeContracts, 2)} d{m?.x ?? "SPYx"})
              </span>
            </div>

            <div className="mt-4 divide-y divide-line border-t border-line">
              <Row k="Entry Mark Yield" v={`${markYield.toFixed(4)}% (${usd(markPrice, 4)})`} accent />
              <Row k="Oracle Index Yield" v={`${indexYield.toFixed(4)}% (${usd(indexPrice, 4)})`} />
              <Row k="Estimated Liquidation Yield" v={`${liqYieldPct.toFixed(4)}%`} />
              <Row
                k="8h Funding Payment"
                v={`${perp?.fundingRate8hBps && perp.fundingRate8hBps >= 0 ? "+" : ""}${
                  perp?.fundingRate8hBps.toFixed(2) ?? "0.00"
                } bps`}
              />
              <Row
                k="Pyth Oracle Guard"
                v={`±${tel?.combinedConfBps.toFixed(2) ?? "3.50"} bps (${perp?.riskStatus ?? "NOMINAL"})`}
              />
              <Row k="Onchain Settlement" v="coupon_market vAMM + SPL Memo" />
            </div>
          </div>

          <div className="mt-5 space-y-2.5">
            <ActionButton
              label={cta}
              connectLabel="Connect a devnet wallet to trade perps"
              disabled={bad}
              onClick={go}
            />
            {!v.owner && perp && m && (
              <button
                type="button"
                disabled={deskBusy || collatNum <= 0}
                onClick={async () => {
                  setDeskBusy(true);
                  setDeskSig(null);
                  try {
                    const r = await fetch("/api/devnet-exec", {
                      method: "POST",
                      headers: { "content-type": "application/json" },
                      body: JSON.stringify({
                        kind: "perp",
                        xSymbol: m.x,
                        id: perp.symbol,
                        side,
                        usdcAmount: collatNum,
                        leverage,
                      }),
                    });
                    const j = await r.json();
                    if (j.sig) setDeskSig(j.sig);
                  } finally {
                    setDeskBusy(false);
                  }
                }}
                className="btn btn-line h-11 w-full text-xs"
              >
                {deskBusy ? "Submitting to Solana Devnet..." : `Execute ${side} ${leverage}x via Devnet Desk Relayer →`}
              </button>
            )}
            {deskSig && (
              <div className="flex items-center justify-between rounded-xl border border-lime/40 bg-lime/10 px-4 py-3 text-xs">
                <span className="text-lime">Confirmed on Solana Devnet (`coupon_market` + `SPL Memo`)</span>
                <a href={explorerTx(deskSig)} target="_blank" rel="noreferrer" className="num font-medium text-lime underline">
                  {short(deskSig, 6, 6)} ↗
                </a>
              </div>
            )}
          </div>
          <TestNote />
        </div>

        {/* Right: vAMM Yield Orderbook + All Active Perp Markets */}
        <div className="flex flex-col gap-4">
          <div className="card p-5 sm:p-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="micro !text-[9px] text-lime">vAMM + CLOB Depth</div>
                <div className="display mt-1 text-2xl">{perp?.symbol ?? "dSPYx-PERP"} Yield Book</div>
              </div>
              <span className="num text-xs text-dim">
                Pool Reserve · {cm ? usd(fromRaw(cm.reserveUsdc, USDC_DECIMALS) * 2, 0) : "$5,000"}
              </span>
            </div>

            <div className="mt-4 grid grid-cols-3 border-b border-line pb-2 text-[10px] uppercase tracking-wider text-faint">
              <span>Implied Yield</span>
              <span className="text-right">Coupon Price</span>
              <span className="text-right">Depth (USDC)</span>
            </div>

            {/* Asks */}
            <div className="divide-y divide-line/40">
              {asks.map((a, idx) => (
                <div key={idx} className="grid grid-cols-3 py-2 text-xs">
                  <span className="num text-share">{a.yieldPct.toFixed(4)}%</span>
                  <span className="num text-right text-ink">{usd(a.price, 4)}</span>
                  <span className="num text-right text-dim">{usd(a.sizeUsd, 0)}</span>
                </div>
              ))}
            </div>

            {/* Spread / Mark Banner */}
            <div className="my-2 flex items-center justify-between rounded-xl border border-lime/30 bg-lime/10 px-3.5 py-2 text-xs">
              <span className="num font-medium text-lime">Mark · {markYield.toFixed(4)}%</span>
              <span className="num text-ink">Index · {indexYield.toFixed(4)}%</span>
              <span className="num text-dim">Pyth {usd(m?.xPrice)}</span>
            </div>

            {/* Bids */}
            <div className="divide-y divide-line/40">
              {bids.map((b, idx) => (
                <div key={idx} className="grid grid-cols-3 py-2 text-xs">
                  <span className="num text-lime">{b.yieldPct.toFixed(4)}%</span>
                  <span className="num text-right text-ink">{usd(b.price, 4)}</span>
                  <span className="num text-right text-dim">{usd(b.sizeUsd, 0)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* All Perp Contracts Table */}
          <div className="card overflow-hidden">
            <div className="border-b border-line px-5 py-3.5">
              <div className="display text-xl">All Dividend Yield Perpetuals</div>
            </div>
            <div className="divide-y divide-line">
              {perpMarkets.map((pm) => {
                const p = pm.perp!;
                return (
                  <div
                    key={pm.x}
                    onClick={() => setX(pm.x)}
                    className={`flex cursor-pointer items-center justify-between gap-3 px-5 py-3.5 transition-colors hover:bg-surface-2/60 ${
                      pm.x === m?.x ? "bg-surface-2/40" : ""
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <TokenDot m={pm} size={28} badge="d" />
                      <div>
                        <div className="num text-sm text-ink">{p.symbol}</div>
                        <div className="text-[11px] text-dim">
                          Next ex-div {pm.nextExDate} · Max {p.maxLeverage}x
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="num text-sm text-lime">{p.markYieldPct.toFixed(3)}%</div>
                      <div className="num text-[11px] text-faint">
                        {usd(p.markPriceUsd, 3)} · 8h {p.fundingRate8hBps >= 0 ? "+" : ""}
                        {p.fundingRate8hBps.toFixed(1)} bps
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Verified Onchain Devnet Execution Ledger */}
      <div className="card mt-4 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-6 py-4">
          <div>
            <div className="display text-2xl">Verified Onchain Dividend Perp Executions</div>
            <div className="text-xs text-dim">
              Real Solana devnet transactions routed through `coupon_market` (`EPCXp2gEtwa6c28x19XgM2oV9k3T5pLsUiAzEaJUc3WN`) + `SPL Memo`
            </div>
          </div>
          <span className="micro rounded-full border border-lime/30 bg-lime/10 px-3 py-1 !text-[9px] text-lime">
            Solana Devnet · Verifiable
          </span>
        </div>
        <div className="divide-y divide-line">
          {verifiedPerps.map((o) => {
            const mk = get(o.xSymbol);
            return (
              <a
                key={o.sig}
                href={explorerTx(o.sig)}
                target="_blank"
                rel="noreferrer"
                className="flex flex-wrap items-center justify-between gap-3 px-6 py-3.5 text-sm transition-colors hover:bg-surface-2/50"
              >
                <div className="flex items-center gap-3">
                  {mk && <TokenDot m={mk} size={24} badge="d" />}
                  <span
                    className={`micro rounded-full border px-2.5 py-0.5 !text-[9px] ${
                      o.side === "LONG" ? "border-lime/40 text-lime" : "border-line-2 text-share"
                    }`}
                  >
                    {o.side} {o.leverage}x
                  </span>
                  <span className="num text-ink">{o.id}</span>
                  <span className="num text-xs text-dim">
                    Collateral {usd(o.usdcAmount, 2)} · Notional {usd(o.usdcAmount * (o.leverage ?? 1), 2)}
                  </span>
                </div>
                <span className="num text-xs text-lime">{short(o.sig, 6, 6)} ↗</span>
              </a>
            );
          })}
        </div>
      </div>

      <TxModal tx={v.tx} onClose={v.closeTx} />
    </div>
  );
}

export default function PerpsPage() {
  return (
    <Suspense fallback={<div className="card h-96 animate-pulse p-7" />}>
      <PerpsInner />
    </Suspense>
  );
}
