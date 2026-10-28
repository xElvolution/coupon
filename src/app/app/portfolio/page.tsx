"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { useWallet } from "@solana/wallet-adapter-react";
import { useMarkets } from "@/components/useMarkets";
import { useVault } from "@/components/useVault";
import { GasNote, PageHead, TokenDot, TxModal } from "@/components/app/ui";
import { Rosette } from "@/components/Guilloche";
import { STOCK_THEMES } from "@/components/app/MarketArtwork";
import { units, usd, short } from "@/lib/format";
import { getJSON } from "@/lib/api";
import { USDC_DECIMALS, X_DECIMALS, fromRaw } from "@/lib/vault/sdk";
import { explorerAddr, explorerTx } from "@/lib/vault/deployment";
import {
  PREDICTION_MARKETS,
  loadPredictionPositions,
  savePredictionPositions,
  type UserPredictionPosition,
} from "@/lib/predictions-data";
import {
  PERP_MARKETS,
  loadPerpPositions,
  savePerpPositions,
  type UserPerpPosition,
} from "@/lib/perps-data";

interface Holding { x: string; mint: string; baseUnits: number; uiAmount: number }

export default function Portfolio() {
  const { get } = useMarkets();
  const v = useVault();
  const { publicKey } = useWallet();
  const [chain, setChain] = useState<{ state: "idle" | "loading" | "ok" | "err"; h: Holding[] }>({ state: "idle", h: [] });
  const [predPositions, setPredPositions] = useState<UserPredictionPosition[]>([]);
  const [perpPositions, setPerpPositions] = useState<UserPerpPosition[]>([]);

  useEffect(() => {
    setPredPositions(loadPredictionPositions());
    setPerpPositions(loadPerpPositions());
  }, []);

  useEffect(() => {
    if (!publicKey) { setChain({ state: "idle", h: [] }); return; }
    setChain({ state: "loading", h: [] });
    getJSON<{ ok: boolean; holdings: typeof chain.h }>(`/api/holdings?owner=${publicKey.toBase58()}`)
      .then((j) => setChain(j.ok ? { state: "ok", h: j.holdings } : { state: "err", h: [] }))
      .catch(() => setChain({ state: "err", h: [] }));
  }, [publicKey]);

  const f = (b: bigint) => fromRaw(b, X_DECIMALS);
  const cash = fromRaw(v.usdc, USDC_DECIMALS);
  const rows = Object.entries(v.positions).filter(([, p]) => p.x > 0n || p.p > 0n || p.d > 0n || p.lp > 0n);

  let total = v.owner ? cash : 0;
  let dVal = 0;
  let proj = 0;
  let claim = 0;

  const val = (x: string) => {
    const m = get(x), cm = v.markets[x], p = v.positions[x];
    if (!m?.xPrice || !cm || !p) return null;
    const xUi = f(p.x) * (cm.multiplier ?? 1);
    const pUi = f(p.p) * (cm.mBase ?? 1);
    const dv = f(p.d) * (cm.poolPrice ?? 0);
    return {
      total: (xUi + pUi) * m.xPrice + dv,
      dv,
      proj: f(p.d) * m.trailingYield * m.xPrice,
      claim: f(p.claimable) * (cm.multiplier ?? 1) * m.xPrice,
    };
  };

  for (const [x] of rows) {
    const r = val(x);
    if (!r) continue;
    total += r.total;
    dVal += r.dv;
    proj += r.proj;
    claim += r.claim;
  }

  // Include active prediction tickets and perpetual margin in valuation
  const predValue = predPositions.reduce((acc, p) => {
    const mkt = PREDICTION_MARKETS.find((m) => m.id === p.marketId);
    const markCents = mkt ? (p.side === "YES" ? mkt.yesCents : mkt.noCents) : p.avgPriceCents;
    return acc + p.shares * (markCents / 100);
  }, 0);

  const perpValue = perpPositions.reduce((acc, p) => {
    const mkt = PERP_MARKETS.find((m) => m.ticker === p.ticker);
    const mark = mkt ? mkt.markPrice : p.entryPrice;
    const diff = p.side === "LONG" ? mark - p.entryPrice : p.entryPrice - mark;
    const pnl = diff * p.sizeUnits;
    return acc + Math.max(0, p.collateralUsd + pnl);
  }, 0);

  const perpAnnualCarry = perpPositions.reduce((acc, p) => {
    const mkt = PERP_MARKETS.find((m) => m.ticker === p.ticker);
    if (!mkt || p.side !== "LONG") return acc;
    return acc + p.sizeUsd * (mkt.dividendYieldApy / 100);
  }, 0);

  const combinedTotal = total + predValue + perpValue;
  const combinedTicketsVal = dVal + predValue;
  const combinedProjected = proj + perpAnnualCarry;
  const hist = v.history;

  const handleClosePred = (id: string) => {
    const next = predPositions.filter((p) => p.id !== id);
    setPredPositions(next);
    savePredictionPositions(next);
  };

  const handleClosePerp = (id: string) => {
    const next = perpPositions.filter((p) => p.id !== id);
    setPerpPositions(next);
    savePerpPositions(next);
  };

  return (
    <div className="space-y-6">
      <PageHead
        kicker="Portfolio"
        title="Everything you hold,"
        accent="split two ways."
        sub="Your split shares, dividend coupons, outcome tickets, and perpetual positions in one ledger."
        right={
          v.owner ? (
            <a
              href={explorerAddr(v.owner.toBase58())}
              target="_blank"
              rel="noreferrer"
              className="btn btn-line h-11 px-4 text-xs md:h-9"
            >
              Wallet on Explorer ↗
            </a>
          ) : undefined
        }
      />

      {v.owner && <GasNote sol={v.sol} />}

      {/* 4-Cell Institutional Metric Strip */}
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-4">
        {[
          [
            "Portfolio Value",
            usd(v.owner ? combinedTotal : 0),
            "Equities, coupons & active positions",
          ],
          [
            "Available Cash",
            usd(v.owner ? cash : 0),
            "USDC buying power",
          ],
          [
            "Outcome Tickets & Coupons",
            usd(v.owner ? combinedTicketsVal : 0),
            "Active d-coupons & event contracts",
          ],
          [
            "Dividend Yield & Carry",
            usd(v.owner ? combinedProjected : 0),
            claim > 0 ? `${usd(claim)} claimable now` : "Annualized coupon & perp carry",
          ],
        ].map(([label, value, sub], i) => (
          <motion.div
            key={String(label)}
            initial={{ y: 12, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: i * 0.04 }}
            className="min-w-0 bg-surface p-4 sm:p-5"
          >
            <div className="micro !text-[9px] text-dim">{label}</div>
            <div
              className={`num mt-2.5 truncate text-2xl sm:text-3xl ${
                i === 3 ? "text-lime" : "text-ink"
              }`}
            >
              {value}
            </div>
            <div className="mt-0.5 truncate text-[11px] text-faint sm:text-xs">{sub}</div>
          </motion.div>
        ))}
      </div>

      {/* Vault Split Positions (xStock / p / d) */}
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between border-b border-line px-5 py-4 sm:px-6">
          <div className="display text-2xl">Split &amp; Coupon Positions</div>
          <span className="micro !text-[9px] text-share">Token-2022 Vault</span>
        </div>
        <div className="hidden grid-cols-[1.4fr_1fr_1fr_1fr_1.2fr_1fr] gap-3 border-b border-line px-5 py-2.5 md:grid">
          {["Asset", "xStock Balance", "Share p", "Coupon d", "Value", ""].map((h) => (
            <div key={h} className="micro !text-[9px] text-faint">
              {h}
            </div>
          ))}
        </div>
        {rows.length === 0 && (
          <div className="flex flex-col items-center justify-between gap-2.5 px-4 py-5 text-center sm:flex-row sm:px-5 sm:py-6 sm:text-left">
            <div className="text-xs text-dim sm:text-sm">
              No split xStock or dividend coupon positions yet.
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Link href="/app/faucet" className="btn btn-line h-8 px-3 text-xs sm:h-9 sm:px-3.5">
                Get USDC / xStocks
              </Link>
              <Link href="/app/split" className="btn btn-lime h-8 px-3 text-xs sm:h-9 sm:px-3.5">
                Split xStock →
              </Link>
            </div>
          </div>
        )}
        {rows.map(([x, p]) => {
          const m = get(x);
          const r = val(x);
          return (
            <div
              key={x}
              className="grid grid-cols-3 items-center gap-2.5 border-b border-line px-3.5 py-3 last:border-0 sm:px-5 sm:py-3.5 md:grid-cols-[1.4fr_1fr_1fr_1fr_1.2fr_1fr]"
            >
              <div className="col-span-2 flex min-w-0 items-center gap-2.5 md:col-span-1">
                {m && <TokenDot m={m} size={26} />}
                <div className="min-w-0">
                  <div className="num text-xs font-semibold text-ink sm:text-sm">{x}</div>
                  <div className="truncate text-[11px] text-dim">{m?.name}</div>
                </div>
              </div>
              <div className="num text-right text-xs font-semibold sm:text-sm md:order-5 md:text-left">{usd(r?.total)}</div>
              <div className="min-w-0">
                <div className="micro !text-[8px] text-faint md:hidden">{x}</div>
                <div className="num truncate text-xs sm:text-sm">{units(f(p.x), 4)}</div>
              </div>
              <div className="min-w-0">
                <div className="micro !text-[8px] text-faint md:hidden">p{x}</div>
                <div className="num flex min-w-0 items-center gap-1 truncate text-xs text-share sm:text-sm">
                  {m && <TokenDot m={m} size={16} badge="p" />}
                  {units(f(p.p), 4)}
                </div>
              </div>
              <div className="min-w-0">
                <div className="micro !text-[8px] text-faint md:hidden">d{x}</div>
                <div className="num flex min-w-0 items-center gap-1 truncate text-xs text-lime sm:text-sm">
                  {m && <TokenDot m={m} size={16} badge="d" />}
                  {units(f(p.d), 4)}
                </div>
              </div>
              <div className="col-span-3 flex justify-end gap-2 md:order-6 md:col-span-1">
                <Link href={`/app/split?x=${x}`} className="btn btn-line h-8 flex-1 px-3 text-xs md:flex-none">
                  Split
                </Link>
                <Link href={`/app/trade?x=${x}`} className="btn btn-lime h-8 flex-1 px-3 text-xs md:flex-none">
                  Trade
                </Link>
              </div>
            </div>
          );
        })}
      </div>

      {/* Active Outcome Tickets & Perpetual Positions */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Outcome Tickets — Clean 2-Tier Institutional Cards */}
        <div className="card relative overflow-hidden">
          <Rosette size={200} className="pointer-events-none absolute -right-16 -top-16 text-lime" opacity={0.04} />
          <div className="flex items-center justify-between border-b border-line px-5 py-4 sm:px-6">
            <div>
              <div className="display text-2xl">Outcome Tickets</div>
              <div className="text-[11px] text-dim">Redeem 1:1 for $1.00 USDC when resolved</div>
            </div>
            <Link href="/app/predictions" className="text-xs font-medium text-lime hover:underline">
              Predictions →
            </Link>
          </div>

          {predPositions.length === 0 ? (
            <div className="px-4 py-6 text-center text-xs text-dim sm:text-sm">
              No active outcome tickets yet.{" "}
              <Link href="/app/predictions" className="text-lime hover:underline">
                Explore dividend outcome markets →
              </Link>
            </div>
          ) : (
            <div className="divide-y divide-line">
              {predPositions.map((pos) => {
                const mkt = PREDICTION_MARKETS.find((m) => m.id === pos.marketId);
                const markCents = mkt ? (pos.side === "YES" ? mkt.yesCents : mkt.noCents) : pos.avgPriceCents;
                const valNow = pos.shares * (markCents / 100);
                const pnl = valNow - pos.costUsd;
                const theme = STOCK_THEMES[pos.symbol] ?? STOCK_THEMES.SPYx;
                return (
                  <div key={pos.id} className="p-4 sm:p-5">
                    {/* Top Row: Stock Logo + Symbol + Outcome Badge + Title + Compact Cash Out Button */}
                    <div className="flex items-start justify-between gap-2.5">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <TokenDot m={{ x: pos.symbol, under: pos.symbol, hue: theme.primary }} size={22} badge="d" />
                          <Link
                            href={`/app/predictions/${pos.marketId}`}
                            className="num text-xs font-bold text-ink hover:text-lime sm:text-sm"
                          >
                            {pos.symbol}
                          </Link>
                          <span
                            className={`num rounded px-1.5 py-0.5 text-[10px] font-bold ${
                              pos.side === "YES"
                                ? "bg-[#16C784]/15 text-[#16C784]"
                                : "bg-[#EA3943]/15 text-[#EA3943]"
                            }`}
                          >
                            {pos.side} · {markCents}¢
                          </span>
                        </div>
                        <Link
                          href={`/app/predictions/${pos.marketId}`}
                          className="mt-1 block line-clamp-1 text-xs font-medium text-ink/90 hover:text-lime"
                        >
                          {pos.title}
                        </Link>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleClosePred(pos.id)}
                        className="h-7 shrink-0 rounded-lg border border-line-2 bg-surface-2 px-2.5 text-[11px] font-semibold text-ink transition-colors hover:border-lime/50 hover:text-lime"
                      >
                        Cash Out
                      </button>
                    </div>

                    {/* Bottom Row: 4-Column Tabular Metrics Strip */}
                    <div className="mt-2.5 grid grid-cols-4 gap-2 rounded-lg bg-bg/60 px-3 py-2">
                      <div>
                        <div className="micro !text-[8px] text-faint">Shares</div>
                        <div className="num mt-0.5 text-xs font-semibold text-ink">{units(pos.shares, 1)}</div>
                      </div>
                      <div>
                        <div className="micro !text-[8px] text-faint">Avg / Mark</div>
                        <div className="num mt-0.5 text-xs font-semibold text-ink">
                          {pos.avgPriceCents}¢ → {markCents}¢
                        </div>
                      </div>
                      <div>
                        <div className="micro !text-[8px] text-faint">Value</div>
                        <div className="num mt-0.5 text-xs font-semibold text-ink">{usd(valNow)}</div>
                      </div>
                      <div className="text-right">
                        <div className="micro !text-[8px] text-faint">PnL</div>
                        <div
                          className={`num mt-0.5 text-xs font-semibold ${
                            pnl >= 0 ? "text-[#16C784]" : "text-[#EA3943]"
                          }`}
                        >
                          {pnl >= 0 ? "+" : ""}
                          {usd(pnl)}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Perpetual Positions — Clean Bybit Position Cards */}
        <div className="card relative overflow-hidden">
          <div className="flex items-center justify-between border-b border-line px-5 py-4 sm:px-6">
            <div>
              <div className="display text-2xl">Perpetual Positions</div>
              <div className="text-[11px] text-dim">Up to 25x with continuous dividend carry</div>
            </div>
            <Link href="/app/perps" className="text-xs font-medium text-lime hover:underline">
              Perpetuals →
            </Link>
          </div>

          {perpPositions.length === 0 ? (
            <div className="px-4 py-6 text-center text-xs text-dim sm:text-sm">
              No open perpetual contracts.{" "}
              <Link href="/app/perps" className="text-lime hover:underline">
                Open a Long or Short perp →
              </Link>
            </div>
          ) : (
            <div className="divide-y divide-line">
              {perpPositions.map((pos) => {
                const mkt = PERP_MARKETS.find((m) => m.ticker === pos.ticker);
                const mark = mkt ? mkt.markPrice : pos.entryPrice;
                const diff = pos.side === "LONG" ? mark - pos.entryPrice : pos.entryPrice - mark;
                const pnl = diff * pos.sizeUnits;
                const roe = pos.collateralUsd > 0 ? (pnl / pos.collateralUsd) * 100 : 0;
                const divApy = mkt ? mkt.dividendYieldApy : 0;
                const theme = STOCK_THEMES[pos.symbol] ?? STOCK_THEMES.SPYx;
                return (
                  <div key={pos.id} className="p-4 sm:p-5">
                    {/* Row 1: Position Header & Unrealized PnL */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <TokenDot m={{ x: pos.symbol, under: pos.symbol, hue: theme.primary }} size={24} badge="d" />
                        <div>
                          <div className="flex items-center gap-1.5">
                            <Link
                              href="/app/perps"
                              className="num text-xs font-bold text-ink hover:text-lime sm:text-sm"
                            >
                              {pos.ticker}
                            </Link>
                            <span
                              className={`num rounded px-1.5 py-0.5 text-[10px] font-bold ${
                                pos.side === "LONG"
                                  ? "bg-[#16C784]/15 text-[#16C784]"
                                  : "bg-[#EA3943]/15 text-[#EA3943]"
                              }`}
                            >
                              {pos.side} {pos.leverage}x
                            </span>
                            <span className="rounded border border-line-2 bg-bg px-1.5 py-0.5 text-[9px] text-dim">
                              Cross
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="micro !text-[8px] text-faint">Unrealized PnL (ROE%)</div>
                        <div
                          className={`num text-xs font-bold sm:text-sm ${
                            pnl >= 0 ? "text-[#16C784]" : "text-[#EA3943]"
                          }`}
                        >
                          {pnl >= 0 ? "+" : ""}
                          {usd(pnl)} ({roe >= 0 ? "+" : ""}
                          {roe.toFixed(2)}%)
                        </div>
                      </div>
                    </div>

                    {/* Row 2: Structured 3x2 Metric Grid */}
                    <div className="mt-2.5 grid grid-cols-3 gap-2 rounded-lg bg-bg/60 px-3 py-2">
                      <div>
                        <div className="micro !text-[8px] text-faint">Size (USD)</div>
                        <div className="num mt-0.5 text-xs font-semibold text-ink">
                          {usd(pos.sizeUsd)}{" "}
                          <span className="text-[10px] font-normal text-dim">
                            ({units(pos.sizeUnits, 2)} {pos.symbol})
                          </span>
                        </div>
                      </div>
                      <div>
                        <div className="micro !text-[8px] text-faint">Margin (USDC)</div>
                        <div className="num mt-0.5 text-xs font-semibold text-ink">{usd(pos.collateralUsd)}</div>
                      </div>
                      <div>
                        <div className="micro !text-[8px] text-faint">Div Carry APY</div>
                        <div className="num mt-0.5 text-xs font-semibold text-[#16C784]">
                          {pos.side === "LONG" ? "+" : "-"}
                          {divApy.toFixed(2)}%
                        </div>
                      </div>
                      <div>
                        <div className="micro !text-[8px] text-faint">Entry Price</div>
                        <div className="num mt-0.5 text-xs font-semibold text-ink">${pos.entryPrice.toFixed(2)}</div>
                      </div>
                      <div>
                        <div className="micro !text-[8px] text-faint">Mark Price</div>
                        <div className="num mt-0.5 text-xs font-semibold text-ink">${mark.toFixed(2)}</div>
                      </div>
                      <div>
                        <div className="micro !text-[8px] text-faint">Liq. Price</div>
                        <div className="num mt-0.5 text-xs font-semibold text-amber-400">${pos.liqPrice.toFixed(2)}</div>
                      </div>
                    </div>

                    {/* Row 3: Compact Action Bar */}
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 text-[11px] text-dim">
                        {pos.takeProfit || pos.stopLoss ? (
                          <span className="num rounded border border-line-2 bg-bg px-2 py-0.5 text-[10px]">
                            TP/SL: {pos.takeProfit ? `$${pos.takeProfit}` : "—"} /{" "}
                            {pos.stopLoss ? `$${pos.stopLoss}` : "—"}
                          </span>
                        ) : (
                          <span className="text-[10px] text-faint">TP/SL: Not set</span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => handleClosePerp(pos.id)}
                        className="h-7 rounded-lg border border-line-2 bg-surface-2 px-3 text-[11px] font-semibold text-ink transition-colors hover:border-[#EA3943]/50 hover:text-[#EA3943]"
                      >
                        Close Position
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Bottom Row: Transactions + Mainnet Mirror Read */}
      <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        <div className="card overflow-hidden">
          <div className="border-b border-line px-5 py-4 sm:px-6">
            <div className="display text-2xl">Transactions</div>
          </div>
          {hist.length === 0 && (
            <div className="px-4 py-6 text-center text-xs text-dim sm:text-sm">
              No vault transactions yet.{" "}
              <Link href="/app/split" className="text-lime hover:underline">
                Split your first xStock →
              </Link>
            </div>
          )}
          {hist.slice(0, 12).map((r) => (
            <a
              key={r.sig}
              href={explorerTx(r.sig)}
              target="_blank"
              rel="noreferrer"
              className="flex min-h-10 items-center justify-between gap-2.5 border-b border-line px-3.5 py-2.5 text-xs last:border-0 hover:bg-surface-2/50 sm:px-5 sm:text-sm"
            >
              <div className="flex min-w-0 items-center gap-2.5">
                {get(r.symbol) && <TokenDot m={get(r.symbol)!} size={20} badge={r.badge} />}
                <span
                  className={`micro shrink-0 rounded-full border px-2 py-0.5 !text-[9px] ${
                    r.action === "sell" || r.action === "claim"
                      ? "border-lime/40 text-lime"
                      : "border-line-2 text-dim"
                  }`}
                >
                  {r.action}
                </span>
                <span className="num truncate">{r.lines[r.lines.length - 1]?.[1]}</span>
              </div>
              <span className="num shrink-0 text-[11px] text-lime">{short(r.sig, 4, 4)} ↗</span>
            </a>
          ))}
        </div>

        <div className="card p-5 sm:p-6">
          <div className="flex items-center justify-between">
            <div className="display text-2xl">Mainnet xStock Reader</div>
            <span className="micro !text-[9px] text-lime">Read only</span>
          </div>
          <p className="mt-1.5 text-xs text-dim">
            Reads real Token-2022 xStock balances and live multipliers from Solana mainnet.
          </p>
          <div className="mt-3.5">
            {!publicKey && (
              <div className="rounded-xl border border-line bg-bg/50 px-3.5 py-3.5 text-xs text-dim">
                Connect a wallet in the top bar to inspect mainnet xStock balances for that address.
              </div>
            )}
            {chain.state === "loading" && <div className="text-xs text-dim">Reading mainnet…</div>}
            {chain.state === "err" && <div className="text-xs text-dim">Mainnet read failed. Try again shortly.</div>}
            {chain.state === "ok" && chain.h.length === 0 && (
              <div className="rounded-xl border border-line px-3.5 py-3 text-xs text-dim">
                No xStocks found at {short(publicKey!.toBase58())} on mainnet.
              </div>
            )}
            {chain.h.map((h) => (
              <div key={h.x} className="flex items-center justify-between border-b border-line py-2.5 text-xs last:border-0 sm:text-sm">
                <span className="num">{h.x}</span>
                <span className="num">{units(h.uiAmount, 6)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <TxModal tx={v.tx} onClose={v.closeTx} />
    </div>
  );
}
