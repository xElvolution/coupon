"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { createPortal } from "react-dom";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { Row, TokenDot } from "@/components/app/ui";
import { useVault } from "@/components/useVault";
import {
  BybitCandlestickChart,
  BybitCompanyTab,
  BybitFinancialsTab,
  BybitMarketDrawer,
} from "@/components/app/PerpsTerminalViews";
import {
  PERP_MARKETS,
  loadPerpPositions,
  savePerpPositions,
  type PerpMarket,
  type PerpTimeframe,
  type UserPerpPosition,
} from "@/lib/perps-data";
import { TOKEN_LOGOS } from "@/lib/token-logos";
import { usd, units, short } from "@/lib/format";
import { explorerTx } from "@/lib/vault/deployment";

const TIMEFRAMES: PerpTimeframe[] = ["1m", "5m", "15m", "1h", "4h", "1D", "1W"];
const LEVERAGE_STEPS = [1, 2, 5, 10, 15, 20, 25];
const PCT_NODES = [0, 25, 50, 75, 100];
const DEMO_SIG = "49rSbVS6v61Cq16cbGqE4TFErYGVHvitpHNAV3iPH8ogiLdKcWN68mBmTpHqQMdq25zeRSkoKG9HztWv7v6YhfTv";

function Portal({ children }: { children: React.ReactNode }) {
  const [el, setEl] = useState<HTMLElement | null>(null);
  useEffect(() => setEl(document.body), []);
  return el ? createPortal(children, el) : null;
}

export default function PerpsPage() {
  const vault = useVault();
  const { setVisible } = useWalletModal();
  const isConnected = !!vault.owner;
  const walletUsdc = isConnected ? Number(vault.usdc) / 1e6 : 0;

  const [selectedTicker, setSelectedTicker] = useState<string>("NVDAx-PERP");
  const [drawerOpen, setDrawerOpen] = useState<boolean>(false);

  // Top-right Bybit 2-Icon View Mode: "chart" (Chart/Company/Financials) vs "trade" (Side-by-Side Order Form + Orderbook)
  const [viewMode, setViewMode] = useState<"chart" | "trade">("chart");
  const [mainTab, setMainTab] = useState<"chart" | "company" | "financials">("chart");
  const [tf, setTf] = useState<PerpTimeframe>("1D");
  const [bookTab, setBookTab] = useState<"book" | "trades">("book");

  // Order Ticket State
  const [orderPopupOpen, setOrderPopupOpen] = useState<boolean>(false);
  const [side, setSide] = useState<"LONG" | "SHORT">("LONG");
  const [orderType, setOrderType] = useState<"Limit" | "Market">("Limit");
  const [leverage, setLeverage] = useState<number>(10);
  const [collateral, setCollateral] = useState<string>("250");
  const [limitPrice, setLimitPrice] = useState<string>("217.63");
  const [pctNode, setPctNode] = useState<number>(25);
  const [tpPrice, setTpPrice] = useState<string>("");
  const [slPrice, setSlPrice] = useState<string>("");
  const [showTpSl, setShowTpSl] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);

  // Positions & Bottom Tabs
  const [positions, setPositions] = useState<UserPerpPosition[]>([]);
  const [bottomTab, setBottomTab] = useState<"positions" | "orders" | "assets">("positions");
  const [receipt, setReceipt] = useState<UserPerpPosition | null>(null);

  const market: PerpMarket = useMemo(
    () => PERP_MARKETS.find((m) => m.ticker === selectedTicker) ?? PERP_MARKETS[0],
    [selectedTicker],
  );

  useEffect(() => {
    setPositions(loadPerpPositions());
  }, []);

  useEffect(() => {
    setLimitPrice(market.markPrice.toFixed(2));
  }, [market.ticker, market.markPrice]);

  const candles = market.candles[tf] ?? market.candles["1D"];
  const colNum = Math.max(0, parseFloat(collateral) || 0);
  const entryRef =
    orderType === "Limit" && parseFloat(limitPrice) > 0 ? parseFloat(limitPrice) : market.markPrice;

  const sizeUsd = colNum * leverage;
  const sizeUnits = entryRef > 0 ? sizeUsd / entryRef : 0;

  const maintMargin = 0.005;
  const liqPrice =
    side === "LONG"
      ? Math.max(0.01, entryRef * (1 - 1 / leverage + maintMargin))
      : entryRef * (1 + 1 / leverage - maintMargin);

  const stepLimitPrice = (delta: number) => {
    const cur = parseFloat(limitPrice) || market.markPrice;
    const next = Math.max(0.01, Number((cur + delta).toFixed(2)));
    setOrderType("Limit");
    setLimitPrice(next.toFixed(2));
  };

  const handleSelectPct = (pct: number) => {
    setPctNode(pct);
    const base = walletUsdc > 0 ? walletUsdc : 1000;
    const val = Math.max(10, Math.round((base * pct) / 100));
    setCollateral(pct === 0 ? "0" : String(val));
  };

  const openTradePopup = (nextSide: "LONG" | "SHORT", nextType?: "Limit" | "Market", price?: number) => {
    setSide(nextSide);
    if (nextType) setOrderType(nextType);
    if (price !== undefined) {
      setOrderType("Limit");
      setLimitPrice(price.toFixed(2));
    }
    setOrderPopupOpen(true);
  };

  const handleExecuteOrder = () => {
    if (!isConnected) {
      setVisible(true);
      return;
    }
    if (colNum <= 0 || submitting) return;
    setSubmitting(true);
    setTimeout(() => {
      const tp = parseFloat(tpPrice);
      const sl = parseFloat(slPrice);
      const pos: UserPerpPosition = {
        id: `perp-${Date.now()}`,
        ticker: market.ticker,
        symbol: market.symbol,
        side,
        collateralUsd: colNum,
        leverage,
        sizeUsd,
        sizeUnits,
        entryPrice: entryRef,
        liqPrice,
        takeProfit: tp > 0 ? tp : undefined,
        stopLoss: sl > 0 ? sl : undefined,
        openedAt: Date.now(),
        sig: DEMO_SIG,
      };
      const updated = [pos, ...positions];
      setPositions(updated);
      savePerpPositions(updated);
      setSubmitting(false);
      setOrderPopupOpen(false);
      setReceipt(pos);
      setBottomTab("positions");
    }, 320);
  };

  const handleClosePosition = (id: string) => {
    const updated = positions.filter((p) => p.id !== id);
    setPositions(updated);
    savePerpPositions(updated);
  };

  const maxAskTotal = Math.max(...market.asks.map((a) => a.totalUsd), 1);
  const maxBidTotal = Math.max(...market.bids.map((b) => b.totalUsd), 1);

  // Reusable Side-by-Side Bybit Trade Execution + Live Orderbook (Screenshot 4)
  const renderBybitTradeExecution = (inModal = false) => (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1.22fr_1fr] sm:gap-4">
      {/* LEFT COLUMN: Bybit Order Entry Form */}
      <div className="space-y-2.5">
        {/* Buy / Sell Segmented Pill */}
        <div className="grid grid-cols-2 rounded-full bg-bg p-0.5 border border-line-2">
          <button
            type="button"
            onClick={() => setSide("LONG")}
            className={`h-8 rounded-full text-xs font-bold transition-all ${
              side === "LONG"
                ? "bg-[#16C784] text-[#0A0B0D] shadow-sm"
                : "text-dim hover:text-ink"
            }`}
          >
            Buy / Long
          </button>
          <button
            type="button"
            onClick={() => setSide("SHORT")}
            className={`h-8 rounded-full text-xs font-bold transition-all ${
              side === "SHORT"
                ? "bg-[#EA3943] text-white shadow-sm"
                : "text-dim hover:text-ink"
            }`}
          >
            Sell / Short
          </button>
        </div>

        {/* Available USDC + Leverage Pill Row */}
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-dim">Available</span>
          <div className="flex items-center gap-1.5">
            <span className="num font-semibold text-ink">{usd(walletUsdc)} USDC</span>
            <Link
              href="/app/faucet"
              className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-line-2 text-[10px] text-lime hover:border-lime"
              title="Get USDC"
            >
              +
            </Link>
          </div>
        </div>

        {/* Order Type (Limit / Market) + Leverage Dropdown Row */}
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <div className="flex h-9 items-center justify-between rounded-lg border border-line-2 bg-[#161922] px-2.5">
            <select
              value={orderType}
              onChange={(e) => setOrderType(e.target.value as "Limit" | "Market")}
              aria-label="Order Type"
              className="w-full bg-transparent text-xs font-medium text-ink outline-none"
            >
              <option value="Limit" className="bg-[#11131A]">Limit</option>
              <option value="Market" className="bg-[#11131A]">Market</option>
            </select>
          </div>

          <div className="flex h-9 items-center rounded-lg border border-line-2 bg-[#161922] px-2.5">
            <select
              value={leverage}
              onChange={(e) => setLeverage(Number(e.target.value))}
              aria-label="Leverage"
              className="num bg-transparent text-xs font-bold text-lime outline-none"
            >
              {LEVERAGE_STEPS.map((lev) => (
                <option key={lev} value={lev} className="bg-[#11131A] text-ink">
                  Cross {lev}x
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Bybit Integrated Price Input Box: [ Price 217.59   — | + ] (Screenshot 4) */}
        {orderType === "Limit" ? (
          <div className="flex h-10 items-center justify-between rounded-lg border border-line-2 bg-[#161922] px-2.5 focus-within:border-lime/60">
            <div className="min-w-0 flex-1">
              <div className="text-[9px] text-dim leading-none">Price (USD)</div>
              <input
                type="text"
                inputMode="decimal"
                size={1}
                value={limitPrice}
                onChange={(e) => setLimitPrice(e.target.value.replace(/[^0-9.]/g, ""))}
                className="num mt-0.5 w-full min-w-0 bg-transparent text-xs font-semibold text-ink outline-none sm:text-sm"
              />
            </div>
            <div className="ml-2 flex shrink-0 items-center border-l border-line-2 pl-2 text-dim">
              <button
                type="button"
                onClick={() => stepLimitPrice(-0.25)}
                className="flex h-6 w-6 items-center justify-center rounded hover:bg-surface-2 hover:text-ink"
                aria-label="Decrease limit price"
              >
                −
              </button>
              <span className="mx-1 h-3 w-px bg-line-2" />
              <button
                type="button"
                onClick={() => stepLimitPrice(0.25)}
                className="flex h-6 w-6 items-center justify-center rounded hover:bg-surface-2 hover:text-ink"
                aria-label="Increase limit price"
              >
                +
              </button>
            </div>
          </div>
        ) : (
          <div className="flex h-10 items-center justify-between rounded-lg border border-line bg-bg/60 px-3 text-xs text-dim">
            <span>Execution Price</span>
            <span className="num font-semibold text-ink">Pyth Mark (${market.markPrice.toFixed(2)})</span>
          </div>
        )}

        {/* Collateral / Order Size Input Box */}
        <div className="flex h-10 items-center justify-between rounded-lg border border-line-2 bg-[#161922] px-2.5 focus-within:border-lime/60">
          <div className="min-w-0 flex-1">
            <div className="text-[9px] text-dim leading-none">Margin (USDC)</div>
            <input
              type="text"
              inputMode="decimal"
              size={1}
              value={collateral}
              onChange={(e) => setCollateral(e.target.value.replace(/[^0-9.]/g, ""))}
              placeholder="100"
              className="num mt-0.5 w-full min-w-0 bg-transparent text-xs font-semibold text-ink outline-none sm:text-sm"
            />
          </div>
          <span className="num ml-2 shrink-0 text-xs font-semibold text-ink">
            ≈ {units(sizeUnits, 2)} {market.symbol.replace(/x$/, "")}
          </span>
        </div>

        {/* Bybit 5-Node Percentage Slider (0% — 25% — 50% — 75% — 100%) */}
        <div className="px-1 pt-1">
          <div className="relative flex items-center justify-between">
            <div className="absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2 bg-line-2" />
            {PCT_NODES.map((node) => {
              const active = pctNode >= node;
              return (
                <button
                  key={node}
                  type="button"
                  onClick={() => handleSelectPct(node)}
                  className="group relative z-10 flex flex-col items-center"
                >
                  <span
                    className={`h-3 w-3 rounded-full border-2 transition-all ${
                      active
                        ? "border-ink bg-ink scale-110"
                        : "border-line-2 bg-[#0F1117] group-hover:border-dim"
                    }`}
                  />
                  <span className="num mt-1 text-[9px] text-dim">{node}%</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Compact Confirmation Summary Box */}
        <div className="space-y-1 rounded-lg border border-line bg-bg/50 px-2.5 py-2 text-[11px]">
          <div className="flex justify-between">
            <span className="text-dim">Notional Size</span>
            <span className="num font-semibold text-ink">{usd(sizeUsd)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-dim">Est. Liq. Price</span>
            <span className="num font-semibold text-[#F5A623]">${liqPrice.toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-dim">Dividend Carry</span>
            <span className="num text-[#16C784]">
              {side === "LONG" ? `+${market.dividendYieldApy.toFixed(2)}% APY` : `-${market.dividendYieldApy.toFixed(2)}% APY`}
            </span>
          </div>
        </div>

        {/* Optional TP/SL Accordion */}
        <div>
          <button
            type="button"
            onClick={() => setShowTpSl((s) => !s)}
            className="flex items-center gap-1.5 text-[11px] text-dim hover:text-ink"
          >
            <span className={`inline-block h-3 w-3 rounded border ${showTpSl ? "border-lime bg-lime text-bg" : "border-line-2"}`} />
            <span>TP / SL</span>
          </button>
          {showTpSl && (
            <div className="mt-1.5 grid grid-cols-2 gap-2">
              <input
                type="text"
                inputMode="decimal"
                size={1}
                value={tpPrice}
                onChange={(e) => setTpPrice(e.target.value.replace(/[^0-9.]/g, ""))}
                placeholder="Take Profit ($)"
                className="num h-8 min-w-0 rounded-lg border border-line-2 bg-[#161922] px-2 text-xs text-ink outline-none"
              />
              <input
                type="text"
                inputMode="decimal"
                size={1}
                value={slPrice}
                onChange={(e) => setSlPrice(e.target.value.replace(/[^0-9.]/g, ""))}
                placeholder="Stop Loss ($)"
                className="num h-8 min-w-0 rounded-lg border border-line-2 bg-[#161922] px-2 text-xs text-ink outline-none"
              />
            </div>
          )}
        </div>

        {/* Primary Action CTA (Wallet Gate when disconnected) */}
        <button
          type="button"
          onClick={handleExecuteOrder}
          disabled={submitting || (isConnected && colNum <= 0)}
          className={`h-10 w-full rounded-full text-xs font-bold transition-transform active:scale-[0.99] sm:text-sm ${
            !isConnected
              ? "bg-lime text-[#0A0B0D]"
              : side === "LONG"
              ? "bg-[#16C784] text-[#0A0B0D]"
              : "bg-[#EA3943] text-white"
          }`}
        >
          {!isConnected
            ? "Connect Wallet to Trade"
            : submitting
            ? "Submitting Order…"
            : `${side === "LONG" ? "Buy / Long" : "Sell / Short"} ${market.symbol.replace(/x$/, "")} · ${usd(sizeUsd)}`}
        </button>

        {inModal && (
          <div className="text-center text-[10px] text-dim">
            Tap any Orderbook price on the right to pre-fill Limit Price
          </div>
        )}
      </div>

      {/* RIGHT COLUMN: Live Click-to-Fill Orderbook (Bybit Screenshot 4) */}
      <div className="flex flex-col justify-between rounded-xl border border-line bg-bg/40 p-2.5">
        <div>
          <div className="flex items-center justify-between text-[10px]">
            <span className="inline-flex items-center gap-1 text-[#16C784]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#16C784]" /> Mkt Open
            </span>
            <span className="num text-dim">Pyth 400ms</span>
          </div>

          <div className="mt-2 grid grid-cols-2 text-[9px] text-dim">
            <span>Price (USD)</span>
            <span className="text-right">Shares ({market.symbol.replace(/x$/, "")})</span>
          </div>

          {/* Asks (Red) */}
          <div className="mt-1 space-y-0.5">
            {[...market.asks].reverse().slice(0, 5).map((row, idx) => {
              const wPct = Math.min(100, Math.round((row.totalUsd / maxAskTotal) * 100));
              return (
                <button
                  key={`ask-${idx}`}
                  type="button"
                  onClick={() => {
                    setOrderType("Limit");
                    setLimitPrice(row.price.toFixed(2));
                  }}
                  className="relative grid w-full grid-cols-2 items-center overflow-hidden rounded px-1.5 py-0.5 text-left text-[11px] hover:bg-surface-2"
                >
                  <div
                    className="pointer-events-none absolute inset-y-0 right-0 bg-[#EA3943]/18"
                    style={{ width: `${wPct}%` }}
                  />
                  <span className="num relative text-[#EA3943]">{row.price.toFixed(2)}</span>
                  <span className="num relative text-right text-ink">{units(row.size, 0)}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Mid / Mark Price Readout */}
        <div className="my-1.5 border-y border-line/70 py-1.5">
          <div className="flex items-baseline gap-1.5">
            <span
              className={`num text-sm font-bold sm:text-base ${
                market.change24hPct >= 0 ? "text-[#16C784]" : "text-[#EA3943]"
              }`}
            >
              {market.markPrice.toFixed(2)}
            </span>
            <span
              className={`num text-[10px] ${
                market.change24hPct >= 0 ? "text-[#16C784]" : "text-[#EA3943]"
              }`}
            >
              {market.change24hPct >= 0 ? "+" : ""}
              {market.change24hPct.toFixed(2)}%
            </span>
          </div>
          <div className="num text-[10px] text-dim">≈ {market.indexPrice.toFixed(2)} USD</div>
        </div>

        {/* Bids (Green) */}
        <div className="space-y-0.5">
          {market.bids.slice(0, 5).map((row, idx) => {
            const wPct = Math.min(100, Math.round((row.totalUsd / maxBidTotal) * 100));
            return (
              <button
                key={`bid-${idx}`}
                type="button"
                onClick={() => {
                  setOrderType("Limit");
                  setLimitPrice(row.price.toFixed(2));
                }}
                className="relative grid w-full grid-cols-2 items-center overflow-hidden rounded px-1.5 py-0.5 text-left text-[11px] hover:bg-surface-2"
              >
                <div
                  className="pointer-events-none absolute inset-y-0 right-0 bg-[#16C784]/18"
                  style={{ width: `${wPct}%` }}
                />
                <span className="num relative text-[#16C784]">{row.price.toFixed(2)}</span>
                <span className="num relative text-right text-ink">{units(row.size, 0)}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-3 pb-24 sm:space-y-4 lg:pb-8">
      {/* BYBIT TOP CATEGORY NAV STRIP (Stocks | Perpetual | Options | Predictions) */}
      <div className="flex items-center justify-between border-b border-line pb-2">
        <div className="flex items-center gap-4 text-xs font-semibold sm:text-sm">
          <span className="text-ink">Stocks Perp</span>
          <Link href="/app/split" className="text-dim hover:text-ink">
            Dividend Strip
          </Link>
          <Link href="/app/predictions" className="text-dim hover:text-ink">
            Predictions
          </Link>
          <Link href="/app/trade" className="hidden text-dim hover:text-ink sm:inline">
            Spot AMM
          </Link>
        </div>
        <span className="num text-[10px] text-lime">24/7 Onchain Equities</span>
      </div>

      {/* BYBIT INSTRUMENT HEADER BAR (Logo + NVDA ▾ + Mkt Open + Top-Right [🕯️ Chart | 🧾 Trade] Toggle) */}
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          className="group flex min-w-0 items-center gap-2.5 text-left"
        >
          {TOKEN_LOGOS[market.symbol] && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={TOKEN_LOGOS[market.symbol]}
              alt={market.symbol}
              className="h-8 w-8 shrink-0 rounded-full border border-line-2 sm:h-9 sm:w-9"
            />
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="num text-base font-extrabold tracking-tight text-ink sm:text-lg">
                {market.symbol.replace(/x$/, "")}
              </span>
              <span className="text-xs text-dim group-hover:text-ink">▾</span>
              <span className="rounded bg-lime/15 px-1.5 py-0.5 text-[9px] font-bold text-lime">
                {market.maxLeverage}x
              </span>
            </div>
            <div className="mt-0.5 flex items-center gap-1.5">
              <span className="inline-flex items-center gap-1 rounded-full border border-line-2 bg-surface px-2 py-0.5 text-[9px] font-medium text-ink">
                <span className="h-1.5 w-1.5 rounded-full bg-[#16C784]" /> Mkt Open ›
              </span>
              <span className="max-w-[115px] truncate text-[10px] text-dim sm:max-w-[200px]">
                {market.companyFull} ›
              </span>
            </div>
          </div>
        </button>

        {/* Top-Right 2-Icon View Toggle Pill (Bybit Screenshots 1 & 4) */}
        <div className="flex shrink-0 items-center rounded-full border border-line-2 bg-surface p-0.5">
          <button
            type="button"
            onClick={() => setViewMode("chart")}
            title="Chart, Company & Financials View"
            className={`flex h-7 w-9 items-center justify-center rounded-full transition-colors ${
              viewMode === "chart" ? "bg-surface-2 text-ink" : "text-dim hover:text-ink"
            }`}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M7 4v16M5 8h4v8H5zM17 4v16M15 7h4v9h-4z" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => setViewMode("trade")}
            title="Trade & Orderbook View"
            className={`flex h-7 w-9 items-center justify-center rounded-full transition-colors ${
              viewMode === "trade" ? "bg-surface-2 text-ink" : "text-dim hover:text-ink"
            }`}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="4" y="4" width="16" height="16" rx="2" />
              <path d="M8 9h8M8 13h5M8 17h4" />
            </svg>
          </button>
        </div>
      </div>

      {/* MAIN TERMINAL GRID (Desktop shows Chart + Right Trade Dock; Mobile switches cleanly via viewMode & Popup) */}
      <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-[1fr_380px]">
        {/* LEFT / PRIMARY COLUMN */}
        <div className="min-w-0 space-y-3.5">
          {viewMode === "trade" ? (
            <div className="card p-3 sm:p-4">{renderBybitTradeExecution(false)}</div>
          ) : (
            <div className="card overflow-hidden">
              {/* Sub-Navigation Tabs: Chart | Company | Financials (Bybit Screenshots 1, 2, 3) */}
              <div className="flex items-center justify-between border-b border-line px-3.5">
                <div className="flex items-center gap-5">
                  {(
                    [
                      ["chart", "Chart"],
                      ["company", "Company"],
                      ["financials", "Financials"],
                    ] as const
                  ).map(([k, label]) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setMainTab(k)}
                      className={`relative py-2.5 text-xs font-semibold transition-colors sm:text-sm ${
                        mainTab === k ? "text-ink" : "text-dim hover:text-ink"
                      }`}
                    >
                      {label}
                      {mainTab === k && (
                        <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-ink" />
                      )}
                    </button>
                  ))}
                </div>
                <span className="num text-[10px] text-dim">{market.exchange} · Token-2022</span>
              </div>

              {mainTab === "chart" && (
                <div>
                  {/* Price & Compact Telemetry Header (Bybit Screenshot 1) */}
                  <div className="border-b border-line p-3.5 sm:p-4">
                    <div className="grid grid-cols-[1.2fr_1fr] items-start gap-3">
                      <div>
                        <div className="text-[10px] text-dim">Trading · Live Pyth Oracle</div>
                        <div
                          className={`num mt-0.5 text-2xl font-extrabold tracking-tight sm:text-3xl ${
                            market.change24hPct >= 0 ? "text-[#16C784]" : "text-[#EA3943]"
                          }`}
                        >
                          {market.markPrice.toFixed(2)}
                        </div>
                        <div
                          className={`num mt-0.5 text-[11px] font-medium ${
                            market.change24hPct >= 0 ? "text-[#16C784]" : "text-[#EA3943]"
                          }`}
                        >
                          {market.change24hUsd >= 0 ? "+" : ""}
                          {market.change24hUsd.toFixed(2)} ({market.change24hPct >= 0 ? "+" : ""}
                          {market.change24hPct.toFixed(2)}%)
                        </div>
                      </div>

                      <div className="space-y-1 text-[11px]">
                        <div className="flex justify-between">
                          <span className="text-dim">High</span>
                          <span className="num text-[#16C784]">{market.high24h.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-dim">Low</span>
                          <span className="num text-[#EA3943]">{market.low24h.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-dim">Volume</span>
                          <span className="num text-ink">{market.volume24hShares}</span>
                        </div>
                      </div>
                    </div>

                    {/* 3×2 Telemetry Sub-Grid (Open, Turnover, Turnover Rate, Prev. Close, P/E TTM, Mkt Cap / Div APY) */}
                    <div className="mt-3 grid grid-cols-3 gap-x-3 gap-y-2 border-t border-line/60 pt-2.5 text-[11px]">
                      <div>
                        <div className="text-[10px] text-dim">Open</div>
                        <div className="num font-semibold text-ink">{market.open24h.toFixed(2)}</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-dim">Turnover</div>
                        <div className="num font-semibold text-ink">{usd(market.volume24hUsd)}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-[10px] text-dim">Div Carry APY</div>
                        <div className="num font-semibold text-[#16C784]">+{market.dividendYieldApy.toFixed(2)}%</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-dim">Prev. Close</div>
                        <div className="num font-semibold text-ink">{market.prevClose.toFixed(2)}</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-dim">P/E TTM</div>
                        <div className="num font-semibold text-ink">{market.peTtm}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-[10px] text-dim">Mkt Cap</div>
                        <div className="num font-semibold text-ink">{market.marketCap}</div>
                      </div>
                    </div>
                  </div>

                  {/* Timeframe Strip (1m | 5m | 15m | 1h | 4h | 1D | 1W) */}
                  <div className="flex items-center justify-between border-b border-line/60 px-3 py-1.5">
                    <div className="flex items-center gap-1">
                      {TIMEFRAMES.map((k) => (
                        <button
                          key={k}
                          type="button"
                          onClick={() => setTf(k)}
                          className={`num rounded px-2 py-0.5 text-[11px] font-semibold transition-colors ${
                            tf === k ? "bg-surface-2 text-ink" : "text-dim hover:text-ink"
                          }`}
                        >
                          {k}
                        </button>
                      ))}
                    </div>
                    <span className="num text-[10px] text-dim">Mult {market.tokenMultiplier}</span>
                  </div>

                  {/* Candlestick + MA7/MA14/MA28 + Volume Chart */}
                  <BybitCandlestickChart candles={candles} symbol={market.symbol} />

                  {/* Interactive Order Book & Recent Trades Below Chart (Tapping any price opens Limit Order Popup!) */}
                  <div className="border-t border-line p-3.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4 text-xs font-semibold">
                        <button
                          type="button"
                          onClick={() => setBookTab("book")}
                          className={bookTab === "book" ? "text-ink" : "text-dim hover:text-ink"}
                        >
                          Order Book
                        </button>
                        <button
                          type="button"
                          onClick={() => setBookTab("trades")}
                          className={bookTab === "trades" ? "text-ink" : "text-dim hover:text-ink"}
                        >
                          Recent Trades
                        </button>
                      </div>
                      <span className="text-[10px] text-lime">Tap any price to open Limit Order</span>
                    </div>

                    {bookTab === "book" ? (
                      <div className="mt-2.5 grid grid-cols-2 gap-3 text-[11px]">
                        {/* Bids */}
                        <div>
                          <div className="mb-1 flex justify-between text-[9px] text-dim">
                            <span>Bid (Shares)</span>
                            <span>Price</span>
                          </div>
                          <div className="space-y-0.5">
                            {market.bids.slice(0, 5).map((b, i) => (
                              <button
                                key={i}
                                type="button"
                                onClick={() => openTradePopup("LONG", "Limit", b.price)}
                                className="relative flex w-full items-center justify-between overflow-hidden rounded px-1.5 py-1 hover:bg-surface-2"
                              >
                                <div
                                  className="pointer-events-none absolute inset-y-0 right-0 bg-[#16C784]/15"
                                  style={{ width: `${Math.min(100, (b.totalUsd / maxBidTotal) * 100)}%` }}
                                />
                                <span className="num relative text-ink">{units(b.size, 0)}</span>
                                <span className="num relative font-semibold text-[#16C784]">
                                  {b.price.toFixed(2)}
                                </span>
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Asks */}
                        <div>
                          <div className="mb-1 flex justify-between text-[9px] text-dim">
                            <span>Price</span>
                            <span>Ask (Shares)</span>
                          </div>
                          <div className="space-y-0.5">
                            {market.asks.slice(0, 5).map((a, i) => (
                              <button
                                key={i}
                                type="button"
                                onClick={() => openTradePopup("SHORT", "Limit", a.price)}
                                className="relative flex w-full items-center justify-between overflow-hidden rounded px-1.5 py-1 hover:bg-surface-2"
                              >
                                <div
                                  className="pointer-events-none absolute inset-y-0 left-0 bg-[#EA3943]/15"
                                  style={{ width: `${Math.min(100, (a.totalUsd / maxAskTotal) * 100)}%` }}
                                />
                                <span className="num relative font-semibold text-[#EA3943]">
                                  {a.price.toFixed(2)}
                                </span>
                                <span className="num relative text-ink">{units(a.size, 0)}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-2.5 divide-y divide-line/60 text-[11px]">
                        {market.recentTrades.map((t) => (
                          <div key={t.id} className="flex items-center justify-between py-1.5">
                            <span
                              className={`num font-semibold ${
                                t.side === "LONG" ? "text-[#16C784]" : "text-[#EA3943]"
                              }`}
                            >
                              ${t.price.toFixed(2)}
                            </span>
                            <span className="num text-ink">{units(t.size, 1)} sh</span>
                            <span className="text-dim">{t.time}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {mainTab === "company" && <BybitCompanyTab market={market} />}
              {mainTab === "financials" && <BybitFinancialsTab market={market} />}
            </div>
          )}

          {/* STRUCTURED BYBIT POSITIONS / ORDERS / ASSETS PANEL (Clean 2-tier cards, never crushed tables) */}
          <div className="card overflow-hidden">
            <div className="flex items-center justify-between border-b border-line px-3.5 py-2.5 sm:px-5">
              <div className="flex items-center gap-5 text-xs font-semibold sm:text-sm">
                <button
                  type="button"
                  onClick={() => setBottomTab("positions")}
                  className={bottomTab === "positions" ? "text-ink" : "text-dim hover:text-ink"}
                >
                  Positions ({positions.length})
                </button>
                <button
                  type="button"
                  onClick={() => setBottomTab("orders")}
                  className={bottomTab === "orders" ? "text-ink" : "text-dim hover:text-ink"}
                >
                  Orders (0)
                </button>
                <button
                  type="button"
                  onClick={() => setBottomTab("assets")}
                  className={bottomTab === "assets" ? "text-ink" : "text-dim hover:text-ink"}
                >
                  Dividend Carry
                </button>
              </div>
              <Link href="/app/portfolio" className="text-[11px] text-lime hover:underline">
                Full Portfolio →
              </Link>
            </div>

            <div className="p-3.5 sm:p-5">
              {bottomTab === "positions" && (
                <div className="space-y-3">
                  {positions.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-line-2 py-7 text-center text-xs text-dim">
                      No open perpetual positions. Tap <span className="text-[#16C784] font-semibold">Buy / Long</span> or{" "}
                      <span className="text-[#EA3943] font-semibold">Sell / Short</span> to open a contract.
                    </div>
                  ) : (
                    positions.map((pos) => {
                      const mkt = PERP_MARKETS.find((m) => m.ticker === pos.ticker) ?? market;
                      const mark = mkt.markPrice;
                      const diff = pos.side === "LONG" ? mark - pos.entryPrice : pos.entryPrice - mark;
                      const pnl = diff * pos.sizeUnits;
                      const roe = pos.collateralUsd > 0 ? (pnl / pos.collateralUsd) * 100 : 0;

                      return (
                        <div
                          key={pos.id}
                          className="rounded-xl border border-line-2 bg-bg/50 p-3.5 transition-colors hover:border-line"
                        >
                          {/* Row 1: Header (Symbol + LONG/SHORT Lev Badge) & Unrealized PnL */}
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2">
                              {TOKEN_LOGOS[pos.symbol] && (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={TOKEN_LOGOS[pos.symbol]}
                                  alt={pos.symbol}
                                  className="h-6 w-6 shrink-0 rounded-full"
                                />
                              )}
                              <div>
                                <div className="flex items-center gap-1.5">
                                  <span className="num text-xs font-bold text-ink sm:text-sm">{pos.ticker}</span>
                                  <span
                                    className={`num rounded px-1.5 py-0.5 text-[10px] font-bold ${
                                      pos.side === "LONG"
                                        ? "bg-[#16C784]/15 text-[#16C784]"
                                        : "bg-[#EA3943]/15 text-[#EA3943]"
                                    }`}
                                  >
                                    {pos.side} {pos.leverage}x
                                  </span>
                                  <span className="rounded border border-line-2 px-1.5 py-0.5 text-[9px] text-dim">
                                    Cross
                                  </span>
                                </div>
                              </div>
                            </div>

                            <div className="text-right">
                              <div className="micro !text-[8px] text-faint">Unrealized PnL (ROE)</div>
                              <div
                                className={`num text-xs font-bold sm:text-sm ${
                                  pnl >= 0 ? "text-[#16C784]" : "text-[#EA3943]"
                                }`}
                              >
                                {pnl >= 0 ? "+" : ""}
                                {usd(pnl)} ({roe >= 0 ? "+" : ""}
                                {roe.toFixed(1)}%)
                              </div>
                            </div>
                          </div>

                          {/* Row 2: 3×2 Tabular Metrics Grid */}
                          <div className="mt-2.5 grid grid-cols-3 gap-2 rounded-lg border border-line/70 bg-surface/60 px-3 py-2 text-[11px]">
                            <div>
                              <div className="micro !text-[8px] text-faint">Position Size</div>
                              <div className="num mt-0.5 font-semibold text-ink">{usd(pos.sizeUsd)}</div>
                            </div>
                            <div>
                              <div className="micro !text-[8px] text-faint">Margin (USDC)</div>
                              <div className="num mt-0.5 font-semibold text-ink">{usd(pos.collateralUsd)}</div>
                            </div>
                            <div className="text-right">
                              <div className="micro !text-[8px] text-faint">Quantity</div>
                              <div className="num mt-0.5 font-semibold text-ink">
                                {units(pos.sizeUnits, 2)} {pos.symbol.replace(/x$/, "")}
                              </div>
                            </div>
                            <div>
                              <div className="micro !text-[8px] text-faint">Entry Price</div>
                              <div className="num mt-0.5 font-semibold text-ink">${pos.entryPrice.toFixed(2)}</div>
                            </div>
                            <div>
                              <div className="micro !text-[8px] text-faint">Mark Price</div>
                              <div className="num mt-0.5 font-semibold text-ink">${mark.toFixed(2)}</div>
                            </div>
                            <div className="text-right">
                              <div className="micro !text-[8px] text-faint">Liq. Price</div>
                              <div className="num mt-0.5 font-semibold text-[#F5A623]">${pos.liqPrice.toFixed(2)}</div>
                            </div>
                          </div>

                          {/* Row 3: Carry Info & Close Button */}
                          <div className="mt-2.5 flex items-center justify-between gap-2">
                            <span className="num text-[10px] text-dim">
                              Div Carry:{" "}
                              <strong className="text-[#16C784]">+{mkt.dividendYieldApy.toFixed(2)}% APY</strong>
                              {pos.takeProfit ? ` · TP $${pos.takeProfit.toFixed(2)}` : ""}
                              {pos.stopLoss ? ` · SL $${pos.stopLoss.toFixed(2)}` : ""}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleClosePosition(pos.id)}
                              className="h-7 rounded-lg border border-line-2 bg-surface-2 px-3 text-[11px] font-semibold text-ink transition-colors hover:border-lime/50 hover:text-lime"
                            >
                              Close Position
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}

              {bottomTab === "orders" && (
                <div className="rounded-xl border border-dashed border-line-2 py-7 text-center text-xs text-dim">
                  No open limit orders. Tap any price row in the Order Book to place a Limit order.
                </div>
              )}

              {bottomTab === "assets" && (
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                  {PERP_MARKETS.slice(0, 6).map((m) => (
                    <div key={m.ticker} className="rounded-xl border border-line bg-bg/50 p-3">
                      <div className="flex items-center justify-between">
                        <span className="num text-xs font-bold text-ink">{m.ticker}</span>
                        <span className="num text-xs font-semibold text-[#16C784]">
                          +{m.dividendYieldApy.toFixed(2)}% APY
                        </span>
                      </div>
                      <p className="mt-1 text-[11px] text-dim">
                        Next Ex-Div: {m.nextExDivDate} ({m.dividendPerShare})
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN ON DESKTOP: Always-Visible Bybit Trade + Orderbook Panel */}
        <div className="hidden lg:sticky lg:top-20 lg:block">
          <div className="card p-4">{renderBybitTradeExecution(false)}</div>
        </div>
      </div>

      {/* MOBILE FLOATING BYBIT-STYLE DUAL ACTION BAR (Perp Icon + Buy / Long + Sell / Short — Screenshot 1) */}
      {viewMode === "chart" && (
        <Portal>
          <div className="fixed inset-x-0 bottom-[calc(max(10px,env(safe-area-inset-bottom))+60px)] z-30 px-3 lg:hidden">
            <div className="flex items-center gap-2 rounded-2xl border border-line-2 bg-[#11131A]/95 p-2 shadow-[0_-12px_36px_rgba(0,0,0,0.85)] backdrop-blur-md">
              <button
                type="button"
                onClick={() => setViewMode("trade")}
                className="flex h-10 shrink-0 flex-col items-center justify-center rounded-xl border border-line-2 bg-surface px-2.5 text-[9px] font-semibold text-dim hover:text-ink"
              >
                <span className="num text-[11px] font-bold text-lime">Book</span>
                <span>Trade</span>
              </button>

              <button
                type="button"
                onClick={() => openTradePopup("LONG", "Limit")}
                className="flex h-10 flex-1 items-center justify-center rounded-full bg-[#16C784] px-4 text-xs font-bold text-[#0A0B0D] shadow-[0_6px_20px_-6px_rgba(22,199,132,0.6)] active:scale-[0.98]"
              >
                Buy / Long
              </button>

              <button
                type="button"
                onClick={() => openTradePopup("SHORT", "Limit")}
                className="flex h-10 flex-1 items-center justify-center rounded-full bg-[#EA3943] px-4 text-xs font-bold text-white shadow-[0_6px_20px_-6px_rgba(234,57,67,0.6)] active:scale-[0.98]"
              >
                Sell / Short
              </button>
            </div>
          </div>
        </Portal>
      )}

      {/* POP-UP BOTTOM SHEET ORDER DRAWER WHEN TAPPING BUY, SELL, OR ANY ORDERBOOK ROW */}
      <Portal>
        <AnimatePresence>
          {orderPopupOpen && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[75] flex flex-col justify-end bg-black/75 backdrop-blur-sm lg:items-center lg:justify-center lg:p-4"
              onClick={() => setOrderPopupOpen(false)}
            >
              <motion.div
                initial={{ y: 48, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 48, opacity: 0 }}
                transition={{ type: "spring", stiffness: 380, damping: 34 }}
                onClick={(e) => e.stopPropagation()}
                className="max-h-[88svh] w-full overflow-y-auto rounded-t-2xl border border-line-2 bg-[#0F1117] p-3.5 shadow-2xl sm:p-5 lg:max-w-xl lg:rounded-2xl"
              >
                <div className="mx-auto mb-2 h-1 w-9 rounded-full bg-white/20 lg:hidden" />
                <div className="mb-3 flex items-center justify-between border-b border-line pb-2.5">
                  <div className="flex items-center gap-2">
                    {TOKEN_LOGOS[market.symbol] && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={TOKEN_LOGOS[market.symbol]} alt={market.symbol} className="h-6 w-6 rounded-full" />
                    )}
                    <div>
                      <div className="num text-sm font-bold text-ink">{market.ticker}</div>
                      <div className="text-[10px] text-dim">
                        Mark ${market.markPrice.toFixed(2)} · Div Carry +{market.dividendYieldApy.toFixed(2)}% APY
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setOrderPopupOpen(false)}
                    className="flex h-7 w-7 items-center justify-center rounded-full border border-line-2 text-xs text-dim hover:text-ink"
                  >
                    ✕
                  </button>
                </div>

                {renderBybitTradeExecution(true)}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </Portal>

      {/* BYBIT MARKET SWITCHER DRAWER (Screenshot 5) */}
      <Portal>
        <BybitMarketDrawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          markets={PERP_MARKETS}
          selectedTicker={selectedTicker}
          onSelect={(t) => setSelectedTicker(t)}
        />
      </Portal>

      {/* ORDER CONFIRMATION RECEIPT MODAL */}
      <Portal>
        <AnimatePresence>
          {receipt && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[80] flex items-center justify-center bg-bg/75 p-4 backdrop-blur-md"
              onClick={() => setReceipt(null)}
            >
              <motion.div
                initial={{ scale: 0.95, y: 12, opacity: 0 }}
                animate={{ scale: 1, y: 0, opacity: 1 }}
                exit={{ scale: 0.96, opacity: 0 }}
                onClick={(e) => e.stopPropagation()}
                className="w-full max-w-md overflow-hidden rounded-2xl border border-line-2 bg-surface p-5"
              >
                <div className="flex items-center justify-between">
                  <span className="micro text-lime">Perpetual Order Confirmed</span>
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-lime text-xs font-bold text-bg">
                    ✓
                  </span>
                </div>
                <div className="display mt-2 flex items-center gap-2.5 text-2xl text-ink">
                  <TokenDot m={{ x: receipt.symbol, under: receipt.symbol, hue: "#c8f560" }} size={28} badge="d" />
                  {receipt.leverage}x {receipt.side} {receipt.symbol}
                </div>
                <div className="mt-4 divide-y divide-line">
                  <Row k="Contract" v={receipt.ticker} />
                  <Row k="Position Size" v={`${usd(receipt.sizeUsd)} (${units(receipt.sizeUnits, 3)} ${receipt.symbol})`} accent />
                  <Row k="Margin Posted" v={`${usd(receipt.collateralUsd)} USDC`} />
                  <Row k="Entry Price" v={`$${receipt.entryPrice.toFixed(2)}`} />
                  <Row k="Est. Liquidation Price" v={`$${receipt.liqPrice.toFixed(2)}`} />
                </div>
                <div className="mt-4 flex items-center justify-between text-xs">
                  <a
                    href={explorerTx(receipt.sig)}
                    target="_blank"
                    rel="noreferrer"
                    className="num text-lime hover:underline"
                  >
                    View on Solana Explorer ↗
                  </a>
                  <button
                    type="button"
                    onClick={() => setReceipt(null)}
                    className="btn btn-lime h-9 px-5 text-xs"
                  >
                    Done
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </Portal>
    </div>
  );
}
