"use client";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { createPortal } from "react-dom";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { Row, Seg, TokenDot } from "@/components/app/ui";
import { useVault } from "@/components/useVault";
import { Rosette } from "@/components/Guilloche";
import { STOCK_THEMES } from "@/components/app/MarketArtwork";
import {
  PREDICTION_MARKETS,
  loadPredictionPositions,
  savePredictionPositions,
  type PredictionMarket,
  type PredictionTrade,
  type TimeframeKey,
  type UserPredictionPosition,
} from "@/lib/predictions-data";
import { usd, units, short } from "@/lib/format";
import { explorerTx } from "@/lib/vault/deployment";

const TIMEFRAMES: TimeframeKey[] = ["1H", "1D", "1W", "1M", "ALL"];
const DEMO_SIG = "49rSbVS6v61Cq16cbGqE4TFErYGVHvitpHNAV3iPH8ogiLdKcWN68mBmTpHqQMdq25zeRSkoKG9HztWv7v6YhfTv";
const PCT_NODES = [0, 25, 50, 75, 100];

function Portal({ children }: { children: React.ReactNode }) {
  const [el, setEl] = useState<HTMLElement | null>(null);
  useEffect(() => setEl(document.body), []);
  return el ? createPortal(children, el) : null;
}

function PredictionDetailInner() {
  const params = useParams<{ id: string }>();
  const sp = useSearchParams();
  const marketId = params?.id ?? "spyx-q4-div";

  const vault = useVault();
  const { setVisible } = useWalletModal();
  const isConnected = !!vault.owner;
  const walletUsdc = isConnected ? Number(vault.usdc) / 1e6 : 0;

  const market: PredictionMarket = useMemo(
    () => PREDICTION_MARKETS.find((m) => m.id === marketId) ?? PREDICTION_MARKETS[0],
    [marketId]
  );

  const initialSide = sp.get("side")?.toUpperCase() === "NO" ? "NO" : "YES";
  const [side, setSide] = useState<"YES" | "NO">(initialSide);
  const [action, setAction] = useState<"Buy" | "Sell">("Buy");
  const [orderType, setOrderType] = useState<"Market" | "Limit">("Market");
  const [limitCents, setLimitCents] = useState<string>(
    String(initialSide === "YES" ? market.yesCents : market.noCents)
  );
  const [amountUsd, setAmountUsd] = useState<string>("100");
  const [sliderPct, setSliderPct] = useState<number>(25);
  const [tf, setTf] = useState<TimeframeKey>("1M");
  const [activeTab, setActiveTab] = useState<"book" | "trades" | "rules" | "positions">("book");
  const [positions, setPositions] = useState<UserPredictionPosition[]>([]);
  const [customTrades, setCustomTrades] = useState<PredictionTrade[]>([]);

  const [orderSheetOpen, setOrderSheetOpen] = useState<boolean>(false);
  const [confirmStep, setConfirmStep] = useState<boolean>(false);
  const [signingTx, setSigningTx] = useState<boolean>(false);

  const [receiptModal, setReceiptModal] = useState<{
    title: string;
    side: "YES" | "NO";
    shares: number;
    priceCents: number;
    totalUsd: number;
    payoutUsd: number;
    sig: string;
  } | null>(null);

  useEffect(() => {
    const s = sp.get("side")?.toUpperCase();
    if (s === "YES" || s === "NO") {
      setSide(s);
      setLimitCents(String(s === "YES" ? market.yesCents : market.noCents));
      if (sp.get("open") === "1") {
        setOrderSheetOpen(true);
      }
    }
  }, [sp, market]);

  useEffect(() => {
    setPositions(loadPredictionPositions());
  }, []);

  const theme = STOCK_THEMES[market.symbol] ?? STOCK_THEMES.SPYx;
  const activePriceCents =
    orderType === "Limit"
      ? Math.max(1, Math.min(99, Number(limitCents) || (side === "YES" ? market.yesCents : market.noCents)))
      : side === "YES"
      ? market.yesCents
      : market.noCents;

  const usdNum = Math.max(0, Number(amountUsd) || 0);
  const pricePerShare = activePriceCents / 100;
  const sharesOut = pricePerShare > 0 ? usdNum / pricePerShare : 0;
  const potentialPayout = sharesOut * 1.0;
  const netProfit = potentialPayout - usdNum;
  const roiPct = usdNum > 0 ? (netProfit / usdNum) * 100 : 0;

  const marketPositions = useMemo(
    () => positions.filter((p) => p.marketId === market.id),
    [positions, market.id]
  );

  const allTrades = useMemo(
    () => [...customTrades, ...market.recentTrades],
    [customTrades, market.recentTrades]
  );

  const openOrderPopup = (
    targetSide: "YES" | "NO",
    mode: "Market" | "Limit" = "Market",
    prefillCents?: number
  ) => {
    setSide(targetSide);
    setOrderType(mode);
    setLimitCents(
      String(prefillCents ?? (targetSide === "YES" ? market.yesCents : market.noCents))
    );
    setConfirmStep(false);
    setOrderSheetOpen(true);
  };

  const handlePercentageSelect = (pct: number) => {
    setSliderPct(pct);
    const baseBudget = walletUsdc > 0 ? walletUsdc : 400;
    const calc = Math.max(5, Math.round((baseBudget * pct) / 100));
    setAmountUsd(pct === 0 ? "10" : String(calc));
  };

  const handlePrimaryOrderAction = () => {
    if (!isConnected) {
      setVisible(true);
      return;
    }
    if (usdNum <= 0) return;
    if (!confirmStep) {
      setConfirmStep(true);
      return;
    }
    setSigningTx(true);
    setTimeout(() => {
      const newPos: UserPredictionPosition = {
        id: `pos-${Date.now()}`,
        marketId: market.id,
        symbol: market.symbol,
        title: market.title,
        side,
        shares: sharesOut,
        avgPriceCents: activePriceCents,
        costUsd: usdNum,
        openedAt: Date.now(),
        sig: DEMO_SIG,
      };
      const nextPositions = [newPos, ...positions];
      setPositions(nextPositions);
      savePredictionPositions(nextPositions);

      const newTrade: PredictionTrade = {
        id: `tr-${Date.now()}`,
        wallet: vault.owner ? short(vault.owner.toBase58(), 4, 4) : "Wallet · Devnet",
        side,
        action,
        shares: Math.round(sharesOut * 10) / 10,
        priceCents: activePriceCents,
        totalUsd: usdNum,
        timeAgo: "Just now",
        sig: DEMO_SIG,
      };
      setCustomTrades((prev) => [newTrade, ...prev]);

      setSigningTx(false);
      setConfirmStep(false);
      setOrderSheetOpen(false);
      setReceiptModal({
        title: `${action} ${side} · ${market.symbol}`,
        side,
        shares: sharesOut,
        priceCents: activePriceCents,
        totalUsd: usdNum,
        payoutUsd: potentialPayout,
        sig: DEMO_SIG,
      });
    }, 450);
  };

  const handleClosePosition = (posId: string) => {
    const next = positions.filter((p) => p.id !== posId);
    setPositions(next);
    savePredictionPositions(next);
  };

  const renderOrderTicketContent = (inModal: boolean) => (
    <div className="space-y-3.5">
      {inModal && (
        <div className="flex items-start justify-between gap-3 border-b border-line pb-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <TokenDot m={{ x: market.symbol, under: market.symbol, hue: theme.primary }} size={32} badge="d" />
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="num text-xs font-bold text-ink">{market.symbol}</span>
                <span className="rounded-full border border-lime/30 bg-lime/10 px-1.5 py-0.5 text-[9px] font-semibold text-lime">
                  {orderType}
                </span>
              </div>
              <p className="truncate text-xs text-dim">{market.title}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setConfirmStep(false);
              setOrderSheetOpen(false);
            }}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-line-2 bg-bg text-xs text-dim hover:text-ink"
            aria-label="Close order drawer"
          >
            ✕
          </button>
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        <Seg
          options={[
            ["Buy", "Buy"],
            ["Sell", "Sell"],
          ]}
          value={action}
          onChange={(v) => {
            setAction(v);
            setConfirmStep(false);
          }}
        />
        <div className="flex items-center gap-1 rounded-full border border-line-2 bg-bg p-1">
          {(["Market", "Limit"] as const).map((ot) => (
            <button
              key={ot}
              type="button"
              onClick={() => {
                setOrderType(ot);
                setConfirmStep(false);
              }}
              className={`rounded-full px-3 py-1 text-xs transition-colors ${
                orderType === ot ? "bg-surface-2 font-semibold text-lime" : "text-dim hover:text-ink"
              }`}
            >
              {ot}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => {
            setSide("YES");
            setLimitCents(String(market.yesCents));
            setConfirmStep(false);
          }}
          className={`flex h-11 items-center justify-between rounded-xl border px-3 transition-all ${
            side === "YES"
              ? "border-[#16C784] bg-[#16C784] text-[#0A0B0D] shadow-[0_8px_24px_-8px_rgba(22,199,132,0.55)]"
              : "border-line-2 bg-bg/60 text-ink hover:border-[#16C784]/40"
          }`}
        >
          <div className="text-left">
            <div className="text-xs font-bold uppercase">{action} Yes</div>
            <div className={`text-[10px] ${side === "YES" ? "text-[#0A0B0D]/75" : "text-dim"}`}>
              Pays $1.00
            </div>
          </div>
          <span className="num text-base font-bold">{market.yesCents}¢</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setSide("NO");
            setLimitCents(String(market.noCents));
            setConfirmStep(false);
          }}
          className={`flex h-11 items-center justify-between rounded-xl border px-3 transition-all ${
            side === "NO"
              ? "border-[#EA3943] bg-[#EA3943] text-white shadow-[0_8px_24px_-8px_rgba(234,57,67,0.55)]"
              : "border-line-2 bg-bg/60 text-ink hover:border-[#EA3943]/40"
          }`}
        >
          <div className="text-left">
            <div className="text-xs font-bold uppercase">{action} No</div>
            <div className={`text-[10px] ${side === "NO" ? "text-white/80" : "text-dim"}`}>
              Pays $1.00
            </div>
          </div>
          <span className="num text-base font-bold">{market.noCents}¢</span>
        </button>
      </div>

      <div className="flex items-center justify-between text-xs text-dim">
        <span>Available Balance</span>
        <span className="num font-medium text-ink">
          {isConnected ? `${walletUsdc.toFixed(2)} USDC` : "0.00 USDC"}
        </span>
      </div>

      {orderType === "Limit" && (
        <div>
          <div className="mb-1 flex items-center justify-between text-[11px] text-dim">
            <span>Limit Price (1¢ – 99¢)</span>
            <button
              type="button"
              onClick={() =>
                setLimitCents(String(side === "YES" ? market.yesCents : market.noCents))
              }
              className="num text-[11px] text-lime hover:underline"
            >
              Mid ({side === "YES" ? market.yesCents : market.noCents}¢)
            </button>
          </div>
          <div className="flex h-11 items-center justify-between rounded-xl border border-[#262B38] bg-[#141720] px-3 focus-within:border-lime/60">
            <span className="shrink-0 text-xs text-dim">Price</span>
            <div className="flex min-w-0 flex-1 items-center justify-end pr-2">
              <input
                type="text"
                inputMode="numeric"
                value={limitCents}
                onChange={(e) => {
                  setLimitCents(e.target.value.replace(/[^0-9]/g, ""));
                  setConfirmStep(false);
                }}
                className="num min-w-0 w-20 bg-transparent text-right text-base font-bold text-ink outline-none"
              />
              <span className="num ml-0.5 text-sm font-semibold text-dim">¢</span>
            </div>
            <div className="flex shrink-0 items-center gap-1 border-l border-[#262B38] pl-2">
              <button
                type="button"
                onClick={() => {
                  setLimitCents(String(Math.max(1, (Number(limitCents) || 50) - 1)));
                  setConfirmStep(false);
                }}
                className="flex h-7 w-7 items-center justify-center rounded-md bg-surface-2 text-sm font-bold text-ink hover:bg-lime hover:text-bg"
              >
                −
              </button>
              <button
                type="button"
                onClick={() => {
                  setLimitCents(String(Math.min(99, (Number(limitCents) || 50) + 1)));
                  setConfirmStep(false);
                }}
                className="flex h-7 w-7 items-center justify-center rounded-md bg-surface-2 text-sm font-bold text-ink hover:bg-lime hover:text-bg"
              >
                +
              </button>
            </div>
          </div>
        </div>
      )}

      <div>
        <div className="flex h-11 items-center justify-between rounded-xl border border-[#262B38] bg-[#141720] px-3 focus-within:border-lime/60">
          <span className="shrink-0 text-xs text-dim">Amount</span>
          <input
            type="text"
            inputMode="decimal"
            value={amountUsd}
            onChange={(e) => {
              setAmountUsd(e.target.value.replace(/[^0-9.]/g, ""));
              setConfirmStep(false);
            }}
            placeholder="0.00"
            className="num min-w-0 flex-1 bg-transparent px-2 text-right text-base font-bold text-ink outline-none"
          />
          <span className="num shrink-0 rounded-md border border-line-2 bg-surface px-2 py-0.5 text-[11px] font-semibold text-ink">
            USDC
          </span>
        </div>

        <div className="mt-2.5 px-1">
          <div className="relative flex items-center justify-between">
            <div className="absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2 bg-[#262B38]" />
            <div
              className="absolute left-0 top-1/2 h-0.5 -translate-y-1/2 bg-lime transition-all"
              style={{ width: `${sliderPct}%` }}
            />
            {PCT_NODES.map((node) => {
              const activeNode = sliderPct >= node;
              return (
                <button
                  key={node}
                  type="button"
                  onClick={() => handlePercentageSelect(node)}
                  className="group relative z-10 flex flex-col items-center gap-1"
                >
                  <span
                    className={`h-3 w-3 rounded-full border-2 transition-all ${
                      activeNode
                        ? "border-lime bg-bg scale-110"
                        : "border-[#383F52] bg-[#141720] group-hover:border-dim"
                    }`}
                  />
                  <span className="num text-[10px] text-dim group-hover:text-ink">{node}%</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-2 grid grid-cols-4 gap-1.5">
          {[10, 25, 100, 500].map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => {
                setAmountUsd(String(preset));
                setConfirmStep(false);
              }}
              className={`num rounded-lg border py-1 text-[11px] transition-colors ${
                Number(amountUsd) === preset
                  ? "border-lime bg-lime/15 font-semibold text-lime"
                  : "border-line-2 bg-surface text-dim hover:text-ink"
              }`}
            >
              +${preset}
            </button>
          ))}
        </div>
      </div>

      <div
        className={`rounded-xl border p-3 transition-colors ${
          confirmStep
            ? "border-lime/60 bg-lime/[0.07]"
            : "border-line bg-bg/60"
        }`}
      >
        {confirmStep && (
          <div className="mb-1.5 flex items-center justify-between border-b border-lime/25 pb-1.5">
            <span className="micro !text-[9px] text-lime">Review Order Confirmation</span>
            <button
              type="button"
              onClick={() => setConfirmStep(false)}
              className="text-[11px] text-dim hover:text-ink"
            >
              Edit
            </button>
          </div>
        )}
        <div className="space-y-1 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-dim">Order Type · Price</span>
            <span className="num font-semibold text-ink">
              {orderType} @ {activePriceCents}.0¢
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-dim">Outcome Shares</span>
            <span className="num font-semibold text-ink">
              {units(sharesOut, 1)} {side}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-dim">Payout if {side} Wins</span>
            <span className="num font-semibold text-ink">{usd(potentialPayout)} ($1/share)</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-dim">Est. Net Return</span>
            <span className="num font-semibold text-[#16C784]">
              +{usd(Math.max(0, netProfit))} (+{roiPct.toFixed(1)}%)
            </span>
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={handlePrimaryOrderAction}
        disabled={isConnected && (usdNum <= 0 || signingTx)}
        className={`flex h-11 w-full items-center justify-center rounded-xl text-xs font-bold uppercase tracking-wide transition-all sm:text-sm ${
          !isConnected
            ? "bg-lime text-bg hover:brightness-105"
            : side === "YES"
            ? "bg-[#16C784] text-[#0A0B0D] shadow-[0_10px_28px_-10px_rgba(22,199,132,0.65)] hover:brightness-105"
            : "bg-[#EA3943] text-white shadow-[0_10px_28px_-10px_rgba(234,57,67,0.65)] hover:brightness-105"
        }`}
      >
        {!isConnected
          ? "Connect Wallet to Trade"
          : signingTx
          ? "Confirming on Solana Devnet…"
          : confirmStep
          ? `Confirm ${action} ${side} · ${usd(usdNum)}`
          : `${action} ${side} · ${usd(usdNum)} → ${usd(potentialPayout)}`}
      </button>
    </div>
  );

  return (
    <div className="space-y-4 pb-32 sm:space-y-5 lg:pb-16">
      {/* CLEAN SINGLE-INSTRUMENT TOP BAR (No other stock pills colliding with Live Oracle!) */}
      <div className="flex items-center justify-between gap-2 rounded-2xl border border-line-2 bg-surface px-3 py-2.5 sm:px-4">
        <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
          <Link
            href="/app/predictions"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-line-2 bg-bg text-xs text-dim transition-colors hover:border-lime/40 hover:text-lime"
            aria-label="Back to Predictions"
          >
            ←
          </Link>
          <TokenDot m={{ x: market.symbol, under: market.symbol, hue: theme.primary }} size={30} badge="d" />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="num text-sm font-bold text-ink sm:text-base">{market.symbol}</span>
              <span className="truncate text-xs text-dim hidden sm:inline">· {market.company}</span>
            </div>
            <div className="truncate text-[11px] text-dim">
              {market.category} · Resolves {market.endDate}
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-[#16C784]/30 bg-[#16C784]/10 px-2.5 py-1 text-[11px] font-semibold text-[#16C784]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#16C784]" />
            Pyth Oracle
          </span>
        </div>
      </div>

      {/* Main Two-Column Layout */}
      <div className="grid grid-cols-1 gap-4 sm:gap-5 lg:grid-cols-[1.44fr_0.86fr] lg:items-start">
        {/* LEFT COLUMN: Chart + Interactive Orderbook / Limit Rows + Rules */}
        <div className="space-y-4">
          <div className="card relative overflow-hidden border-line-2 p-4 sm:p-6">
            <Rosette size={320} spin className="pointer-events-none absolute -right-28 -top-28 text-lime" opacity={0.05} />

            <h1 className="display text-xl leading-[1.15] text-ink sm:text-3xl">
              {market.title}
            </h1>
            <p className="mt-1 text-xs leading-relaxed text-dim sm:text-sm">{market.subtitle}</p>

            {/* Polymarket / Kalshi Probability Strip (Replaces duplicate Buy YES / Buy NO cards!) */}
            <div className="mt-3 flex flex-wrap items-baseline justify-between gap-2 border-y border-line/80 py-2.5">
              <div className="flex items-baseline gap-2">
                <span className="num text-2xl font-extrabold text-[#16C784] sm:text-3xl">
                  {market.yesCents}% chance
                </span>
                <span className="num rounded-md bg-[#16C784]/15 px-1.5 py-0.5 text-xs font-semibold text-[#16C784]">
                  {market.change24h} 24h
                </span>
              </div>
              <div className="flex items-center gap-3 text-xs">
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-[#16C784]" />
                  <span className="num font-semibold text-ink">Yes {market.yesCents}¢</span>
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-[#EA3943]" />
                  <span className="num font-semibold text-ink">No {market.noCents}¢</span>
                </span>
              </div>
            </div>

            {/* Interactive Touch & Mouse Scrubbable Probability Chart */}
            <div className="mt-3">
              <InteractiveProbabilityChart series={market.series[tf]} />
            </div>

            {/* Chart Footer: Volume + Timeframe Selector */}
            <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-2.5">
              <div className="num text-[11px] text-dim sm:text-xs">
                <strong className="text-ink">{usd(market.volumeUsd, 0)}</strong> Vol ·{" "}
                <strong className="text-ink">{usd(market.liquidityUsd, 0)}</strong> Liq ·{" "}
                {market.tradersCount.toLocaleString()} traders
              </div>

              <div className="flex items-center gap-1 rounded-full border border-line-2 bg-bg p-0.5">
                {TIMEFRAMES.map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setTf(k)}
                    className={`num rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors ${
                      tf === k ? "bg-lime font-semibold text-bg" : "text-dim hover:text-ink"
                    }`}
                  >
                    {k}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Interactive Order Book / Trades / Rules / Tickets Tabs */}
          <div className="card overflow-hidden border-line-2">
            <div className="no-scrollbar flex items-center gap-1 overflow-x-auto border-b border-line bg-surface-2/50 px-3 py-2 sm:px-4">
              {(
                [
                  ["book", "Order Book"],
                  ["trades", `Trades (${allTrades.length})`],
                  ["rules", "Rules & Oracle"],
                  ["positions", `My Tickets (${marketPositions.length})`],
                ] as const
              ).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setActiveTab(k)}
                  className={`shrink-0 rounded-full px-3 py-1.5 text-[11px] font-medium transition-colors sm:px-3.5 sm:text-xs ${
                    activeTab === k ? "bg-lime font-semibold text-bg" : "text-dim hover:text-ink"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="p-3.5 sm:p-5">
              {activeTab === "book" && (
                <div>
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-lime/25 bg-lime/[0.06] px-3 py-2 text-[11px] sm:text-xs">
                    <span className="font-medium text-lime">
                      Tap any Ask or Bid price row below to open a Limit Order at that exact price
                    </span>
                    <span className="num text-ink">
                      Mid: <strong className="text-[#16C784]">YES {market.yesCents}¢</strong> ·{" "}
                      <strong className="text-[#EA3943]">NO {market.noCents}¢</strong>
                    </span>
                  </div>

                  <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
                    {/* YES Orderbook */}
                    <div className="rounded-xl border border-line bg-bg/50 p-3">
                      <div className="mb-2 flex items-center justify-between">
                        <span className="num text-xs font-semibold text-[#16C784]">YES Limit Book</span>
                        <span className="micro !text-[8px] text-dim">Tap row → Limit</span>
                      </div>
                      <div className="grid grid-cols-3 pb-1.5 text-[9px] uppercase tracking-wider text-faint">
                        <span>Price (¢)</span>
                        <span className="text-right">Shares</span>
                        <span className="text-right">Total ($)</span>
                      </div>
                      <div className="space-y-0.5">
                        {market.orderbook.yesAsks
                          .slice()
                          .reverse()
                          .map((lvl) => (
                            <button
                              key={`ya-${lvl.priceCents}`}
                              type="button"
                              onClick={() => openOrderPopup("YES", "Limit", lvl.priceCents)}
                              className="relative grid w-full grid-cols-3 items-center overflow-hidden rounded-md px-2 py-1 text-[11px] transition-colors hover:bg-surface-2"
                            >
                              <span
                                className="pointer-events-none absolute inset-y-0 right-0 bg-[#EA3943]/15"
                                style={{ width: `${Math.min(100, lvl.shares / 320)}%` }}
                              />
                              <span className="num relative text-left font-semibold text-[#EA3943]">
                                {lvl.priceCents}¢
                              </span>
                              <span className="num relative text-right text-ink">{lvl.shares.toLocaleString()}</span>
                              <span className="num relative text-right text-dim">{usd(lvl.totalUsd, 0)}</span>
                            </button>
                          ))}
                      </div>
                      <div className="my-1.5 flex items-center justify-between rounded-lg border border-[#16C784]/30 bg-[#16C784]/10 px-2.5 py-1 text-[11px]">
                        <span className="font-medium text-[#16C784]">Last YES Fill</span>
                        <span className="num font-bold text-[#16C784]">{market.yesCents}.0¢</span>
                      </div>
                      <div className="space-y-0.5">
                        {market.orderbook.yesBids.map((lvl) => (
                          <button
                            key={`yb-${lvl.priceCents}`}
                            type="button"
                            onClick={() => openOrderPopup("YES", "Limit", lvl.priceCents)}
                            className="relative grid w-full grid-cols-3 items-center overflow-hidden rounded-md px-2 py-1 text-[11px] transition-colors hover:bg-surface-2"
                          >
                            <span
                              className="pointer-events-none absolute inset-y-0 right-0 bg-[#16C784]/15"
                              style={{ width: `${Math.min(100, lvl.shares / 320)}%` }}
                            />
                            <span className="num relative text-left font-semibold text-[#16C784]">
                              {lvl.priceCents}¢
                            </span>
                            <span className="num relative text-right text-ink">{lvl.shares.toLocaleString()}</span>
                            <span className="num relative text-right text-dim">{usd(lvl.totalUsd, 0)}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* NO Orderbook */}
                    <div className="rounded-xl border border-line bg-bg/50 p-3">
                      <div className="mb-2 flex items-center justify-between">
                        <span className="num text-xs font-semibold text-[#EA3943]">NO Limit Book</span>
                        <span className="micro !text-[8px] text-dim">Tap row → Limit</span>
                      </div>
                      <div className="grid grid-cols-3 pb-1.5 text-[9px] uppercase tracking-wider text-faint">
                        <span>Price (¢)</span>
                        <span className="text-right">Shares</span>
                        <span className="text-right">Total ($)</span>
                      </div>
                      <div className="space-y-0.5">
                        {market.orderbook.noAsks
                          .slice()
                          .reverse()
                          .map((lvl) => (
                            <button
                              key={`na-${lvl.priceCents}`}
                              type="button"
                              onClick={() => openOrderPopup("NO", "Limit", lvl.priceCents)}
                              className="relative grid w-full grid-cols-3 items-center overflow-hidden rounded-md px-2 py-1 text-[11px] transition-colors hover:bg-surface-2"
                            >
                              <span
                                className="pointer-events-none absolute inset-y-0 right-0 bg-[#EA3943]/15"
                                style={{ width: `${Math.min(100, lvl.shares / 300)}%` }}
                              />
                              <span className="num relative text-left font-semibold text-[#EA3943]">
                                {lvl.priceCents}¢
                              </span>
                              <span className="num relative text-right text-ink">{lvl.shares.toLocaleString()}</span>
                              <span className="num relative text-right text-dim">{usd(lvl.totalUsd, 0)}</span>
                            </button>
                          ))}
                      </div>
                      <div className="my-1.5 flex items-center justify-between rounded-lg border border-[#EA3943]/30 bg-[#EA3943]/10 px-2.5 py-1 text-[11px]">
                        <span className="font-medium text-[#EA3943]">Last NO Fill</span>
                        <span className="num font-bold text-[#EA3943]">{market.noCents}.0¢</span>
                      </div>
                      <div className="space-y-0.5">
                        {market.orderbook.noBids.map((lvl) => (
                          <button
                            key={`nb-${lvl.priceCents}`}
                            type="button"
                            onClick={() => openOrderPopup("NO", "Limit", lvl.priceCents)}
                            className="relative grid w-full grid-cols-3 items-center overflow-hidden rounded-md px-2 py-1 text-[11px] transition-colors hover:bg-surface-2"
                          >
                            <span
                              className="pointer-events-none absolute inset-y-0 right-0 bg-[#16C784]/15"
                              style={{ width: `${Math.min(100, lvl.shares / 300)}%` }}
                            />
                            <span className="num relative text-left font-semibold text-[#16C784]">
                              {lvl.priceCents}¢
                            </span>
                            <span className="num relative text-right text-ink">{lvl.shares.toLocaleString()}</span>
                            <span className="num relative text-right text-dim">{usd(lvl.totalUsd, 0)}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === "trades" && (
                <div className="divide-y divide-line">
                  {allTrades.length === 0 && (
                    <div className="py-6 text-center text-xs text-dim">No recent trades recorded yet.</div>
                  )}
                  {allTrades.map((t) => (
                    <div key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-xs">
                      <div className="flex items-center gap-2">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                            t.side === "YES"
                              ? "border border-[#16C784]/35 bg-[#16C784]/12 text-[#16C784]"
                              : "border border-[#EA3943]/35 bg-[#EA3943]/12 text-[#EA3943]"
                          }`}
                        >
                          {t.action} {t.side}
                        </span>
                        <span className="num text-ink">
                          {t.shares.toLocaleString()} @ {t.priceCents}¢
                        </span>
                        <span className="text-dim">by {t.wallet}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="num font-semibold text-ink">{usd(t.totalUsd)}</span>
                        <span className="text-faint">{t.timeAgo}</span>
                        <a
                          href={explorerTx(t.sig)}
                          target="_blank"
                          rel="noreferrer"
                          className="num text-lime hover:underline"
                        >
                          Tx ↗
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {activeTab === "rules" && (
                <div className="space-y-3.5">
                  <div className="rounded-xl border border-line bg-bg/60 p-3.5">
                    <div className="micro !text-[9px] text-lime">Resolution Criteria</div>
                    <p className="mt-1.5 text-xs leading-relaxed text-ink sm:text-sm">{market.rulesSummary}</p>
                  </div>
                  <div className="divide-y divide-line rounded-xl border border-line bg-bg/40 px-3.5">
                    <Row k="Underlying xStock" v={`${market.company} (${market.symbol})`} />
                    <Row k={market.currentMetricLabel} v={market.currentMetricValue} />
                    <Row k="Target Threshold" v={market.targetMetricValue} accent />
                    <Row k="Oracle Source" v={market.resolutionSource} />
                    <Row k="Cutoff Date (UTC)" v={market.endDate} />
                    <Row k="Settlement Asset" v="USDC (1:1 per winning share)" />
                    <Row k="Token-2022 Mint" v={short(market.onchainMint, 8, 6)} />
                  </div>
                </div>
              )}

              {activeTab === "positions" && (
                <div className="space-y-2.5">
                  {marketPositions.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-line-2 py-6 text-center text-xs text-dim">
                      No open outcome tickets in {market.symbol} yet. Tap Buy YES or Buy NO below to open a ticket.
                    </div>
                  ) : (
                    marketPositions.map((p) => {
                      const markCents = p.side === "YES" ? market.yesCents : market.noCents;
                      const valNow = p.shares * (markCents / 100);
                      const pnl = valNow - p.costUsd;
                      return (
                        <div
                          key={p.id}
                          className="rounded-xl border border-line-2 bg-surface p-3 sm:p-3.5"
                        >
                          <div className="flex items-start justify-between gap-2.5">
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <TokenDot m={{ x: p.symbol, under: p.symbol, hue: theme.primary }} size={22} badge="d" />
                                <span className="num text-xs font-bold text-ink sm:text-sm">{p.symbol}</span>
                                <span
                                  className={`num rounded px-1.5 py-0.5 text-[10px] font-bold ${
                                    p.side === "YES"
                                      ? "bg-[#16C784]/15 text-[#16C784]"
                                      : "bg-[#EA3943]/15 text-[#EA3943]"
                                  }`}
                                >
                                  {p.side} · {markCents}¢
                                </span>
                              </div>
                              <div className="mt-1 line-clamp-1 text-xs font-medium text-ink/90">
                                {p.title}
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleClosePosition(p.id)}
                              className="h-7 shrink-0 rounded-lg border border-line-2 bg-surface-2 px-2.5 text-[11px] font-semibold text-ink transition-colors hover:border-lime/50 hover:text-lime"
                            >
                              Cash Out
                            </button>
                          </div>

                          <div className="mt-2.5 grid grid-cols-4 gap-2 rounded-lg bg-bg/60 px-3 py-2">
                            <div>
                              <div className="micro !text-[8px] text-faint">Shares</div>
                              <div className="num mt-0.5 text-xs font-semibold text-ink">{units(p.shares, 1)}</div>
                            </div>
                            <div>
                              <div className="micro !text-[8px] text-faint">Avg / Mark</div>
                              <div className="num mt-0.5 text-xs font-semibold text-ink">
                                {p.avgPriceCents}¢ → {markCents}¢
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
                    })
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Desktop-Only Sticky Order Ticket */}
        <div className="hidden lg:sticky lg:top-20 lg:block">
          <div className="card overflow-hidden border-line-2 p-5">
            {renderOrderTicketContent(false)}
          </div>
        </div>
      </div>

      {/* MOBILE FLOATING DUAL ACTION BAR (Buy YES | Buy NO + Limit button) */}
      <Portal>
        <div className="fixed inset-x-0 bottom-[calc(max(12px,env(safe-area-inset-bottom))+64px)] z-30 px-3 lg:hidden">
          <div className="flex items-center gap-2 rounded-2xl border border-line-2 bg-[#11131A]/95 p-2 shadow-[0_-12px_36px_rgba(0,0,0,0.85)] backdrop-blur-md">
            <button
              type="button"
              onClick={() => openOrderPopup(side, "Limit")}
              className="flex h-10 shrink-0 flex-col items-center justify-center rounded-xl border border-line-2 bg-surface px-3 text-[10px] font-semibold text-dim transition-colors hover:border-lime/40 hover:text-ink"
            >
              <span className="num text-xs font-bold text-lime">Limit</span>
              <span>Book</span>
            </button>

            <button
              type="button"
              onClick={() => openOrderPopup("YES", "Market")}
              className="flex h-10 flex-1 items-center justify-between rounded-xl bg-[#16C784] px-3.5 font-bold text-[#0A0B0D] shadow-[0_6px_20px_-6px_rgba(22,199,132,0.6)] transition-transform active:scale-[0.98]"
            >
              <span className="text-xs uppercase tracking-wide">Buy YES</span>
              <span className="num text-sm font-extrabold">{market.yesCents}¢</span>
            </button>

            <button
              type="button"
              onClick={() => openOrderPopup("NO", "Market")}
              className="flex h-10 flex-1 items-center justify-between rounded-xl bg-[#EA3943] px-3.5 font-bold text-white shadow-[0_6px_20px_-6px_rgba(234,57,67,0.6)] transition-transform active:scale-[0.98]"
            >
              <span className="text-xs uppercase tracking-wide">Buy NO</span>
              <span className="num text-sm font-extrabold">{market.noCents}¢</span>
            </button>
          </div>
        </div>
      </Portal>

      {/* POP-UP BOTTOM SHEET / MODAL ORDER TICKET */}
      <Portal>
        <AnimatePresence>
          {orderSheetOpen && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[75] flex items-end justify-center bg-black/75 backdrop-blur-sm sm:items-center sm:p-4"
              onClick={() => {
                setConfirmStep(false);
                setOrderSheetOpen(false);
              }}
            >
              <motion.div
                initial={{ y: "100%", opacity: 0.5 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: "100%", opacity: 0 }}
                transition={{ type: "spring", stiffness: 380, damping: 34 }}
                onClick={(e) => e.stopPropagation()}
                className="w-full max-w-md rounded-t-[24px] border border-line-2 bg-[#11131A] p-4 pb-7 shadow-2xl sm:rounded-[24px] sm:p-5"
              >
                <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line-2 sm:hidden" />
                {renderOrderTicketContent(true)}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </Portal>

      {/* Perforated Receipt Modal */}
      <Portal>
        <AnimatePresence>
          {receiptModal && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[80] flex items-center justify-center bg-bg/75 p-4 backdrop-blur-md"
              onClick={() => setReceiptModal(null)}
            >
              <motion.div
                initial={{ scale: 0.94, y: 18, opacity: 0 }}
                animate={{ scale: 1, y: 0, opacity: 1 }}
                exit={{ scale: 0.96, opacity: 0 }}
                onClick={(e) => e.stopPropagation()}
                className="w-full max-w-md overflow-hidden"
              >
                <div className="rounded-t-[20px] border border-line-2 bg-surface p-5">
                  <div className="flex items-center justify-between">
                    <span className="micro text-lime">Confirmed on Solana devnet</span>
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-lime font-bold text-bg">
                      ✓
                    </span>
                  </div>
                  <div className="display mt-2.5 flex items-center gap-2.5 text-2xl text-ink">
                    <TokenDot m={{ x: market.symbol, under: market.symbol, hue: "#c8f560" }} size={30} badge="d" />
                    {receiptModal.title}
                  </div>
                  <div className="mt-4 divide-y divide-line">
                    <Row k="Outcome side" v={receiptModal.side} />
                    <Row k="Shares minted" v={`${units(receiptModal.shares, 2)} ${receiptModal.side}`} />
                    <Row k="Fill price" v={`${receiptModal.priceCents}.0¢`} />
                    <Row k="Total paid" v={`${usd(receiptModal.totalUsd)} USDC`} />
                    <Row k={`Payout if ${receiptModal.side} wins`} v={`${usd(receiptModal.payoutUsd)} USDC`} accent />
                  </div>
                </div>
                <div className="perf-h h-2 bg-surface" />
                <div className="rounded-b-[20px] border border-line-2 border-t-0 bg-surface px-5 pb-5 pt-3.5">
                  <div className="micro !text-[9px] text-faint">Transaction signature</div>
                  <a
                    href={explorerTx(receiptModal.sig)}
                    target="_blank"
                    rel="noreferrer"
                    className="num mt-1 flex items-center justify-between text-xs text-lime hover:underline"
                  >
                    <span>{short(receiptModal.sig, 10, 10)}</span>
                    <span>View on Explorer ↗</span>
                  </a>
                  <button
                    type="button"
                    onClick={() => {
                      setReceiptModal(null);
                      setActiveTab("positions");
                    }}
                    className="btn btn-lime mt-3.5 h-10 w-full text-xs"
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

function InteractiveProbabilityChart({
  series,
}: {
  series: { t: string; yes: number; no: number; vol: number }[];
}) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const w = 760;
  const h = 230;
  const padL = 12;
  const padR = 44;
  const padT = 14;
  const padB = 30;
  const chartW = w - padL - padR;
  const chartH = h - padT - padB;

  const coords = series.map((pt, i) => {
    const x = padL + (i / Math.max(1, series.length - 1)) * chartW;
    const yYes = padT + ((100 - pt.yes) / 100) * chartH;
    const yNo = padT + ((100 - pt.no) / 100) * chartH;
    return { x, yYes, yNo, pt };
  });

  const yesPath = coords.map((c, i) => `${i === 0 ? "M" : "L"}${c.x.toFixed(1)},${c.yYes.toFixed(1)}`).join(" ");
  const noPath = coords.map((c, i) => `${i === 0 ? "M" : "L"}${c.x.toFixed(1)},${c.yNo.toFixed(1)}`).join(" ");
  const yesArea = `${yesPath} L${coords[coords.length - 1].x.toFixed(1)},${padT + chartH} L${coords[0].x.toFixed(1)},${padT + chartH} Z`;

  const maxVol = Math.max(...series.map((s) => s.vol), 1);
  const active = hoverIdx != null ? coords[hoverIdx] : coords[coords.length - 1];

  const handleScrub = (clientX: number) => {
    if (!svgRef.current || coords.length === 0) return;
    const rect = svgRef.current.getBoundingClientRect();
    const relX = ((clientX - rect.left) / Math.max(1, rect.width)) * w;
    const idx = Math.round(((relX - padL) / chartW) * (coords.length - 1));
    const clamped = Math.max(0, Math.min(coords.length - 1, idx));
    setHoverIdx(clamped);
  };

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-bg/60 px-2.5 py-1.5 text-[11px] sm:text-xs">
        <span className="num font-medium text-ink">{active.pt.t}</span>
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-[#16C784]" />
            <span className="num font-semibold text-[#16C784]">YES {active.pt.yes.toFixed(1)}¢</span>
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-[#EA3943]" />
            <span className="num font-semibold text-[#EA3943]">NO {active.pt.no.toFixed(1)}¢</span>
          </span>
          <span className="num text-dim">Vol {usd(active.pt.vol, 0)}</span>
        </div>
      </div>

      <svg
        ref={svgRef}
        viewBox={`0 0 ${w} ${h}`}
        className="h-44 w-full touch-pan-y select-none overflow-visible sm:h-60"
        onPointerDown={(e) => handleScrub(e.clientX)}
        onPointerMove={(e) => {
          if (e.pointerType === "mouse" || e.buttons > 0) handleScrub(e.clientX);
        }}
        onTouchStart={(e) => {
          if (e.touches[0]) handleScrub(e.touches[0].clientX);
        }}
        onTouchMove={(e) => {
          if (e.touches[0]) handleScrub(e.touches[0].clientX);
        }}
        onMouseLeave={() => setHoverIdx(null)}
      >
        <defs>
          <linearGradient id="pred-detail-yes" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#16C784" stopOpacity="0.26" />
            <stop offset="100%" stopColor="#16C784" stopOpacity="0.0" />
          </linearGradient>
        </defs>

        {[0, 25, 50, 75, 100].map((pctVal) => {
          const y = padT + ((100 - pctVal) / 100) * chartH;
          return (
            <g key={pctVal}>
              <line
                x1={padL}
                x2={w - padR}
                y1={y}
                y2={y}
                stroke="rgba(236,232,220,0.08)"
                strokeDasharray="3 3"
              />
              <text
                x={w - padR + 6}
                y={y + 4}
                fill="#8a8f98"
                fontSize="10"
                fontFamily="monospace"
              >
                {pctVal}¢
              </text>
            </g>
          );
        })}

        {coords.map((c, i) => {
          const barH = (c.pt.vol / maxVol) * 22;
          return (
            <rect
              key={`v-${i}`}
              x={c.x - 4}
              y={padT + chartH - barH}
              width={8}
              height={barH}
              rx={2}
              fill="rgba(22,199,132,0.16)"
            />
          );
        })}

        <path d={yesArea} fill="url(#pred-detail-yes)" />
        <path
          d={noPath}
          fill="none"
          stroke="#EA3943"
          strokeWidth="2"
          strokeDasharray="5 4"
          strokeLinecap="round"
        />
        <path d={yesPath} fill="none" stroke="#16C784" strokeWidth="2.6" strokeLinecap="round" />

        {active && (
          <>
            <line
              x1={active.x}
              x2={active.x}
              y1={padT}
              y2={padT + chartH}
              stroke="rgba(236,232,220,0.35)"
              strokeDasharray="3 3"
            />
            <circle cx={active.x} cy={active.yYes} r="5.5" fill="#16C784" stroke="#0A0B0D" strokeWidth="2" />
            <circle cx={active.x} cy={active.yNo} r="4.5" fill="#EA3943" stroke="#0A0B0D" strokeWidth="2" />
          </>
        )}

        {coords
          .filter((_, i) => i % Math.max(1, Math.floor(coords.length / 5)) === 0 || i === coords.length - 1)
          .map((c, i) => (
            <text
              key={`xl-${i}`}
              x={c.x}
              y={h - 6}
              textAnchor="middle"
              fill="#8a8f98"
              fontSize="10"
              fontFamily="monospace"
            >
              {c.pt.t}
            </text>
          ))}
      </svg>
    </div>
  );
}

export default function PredictionDetailPage() {
  return (
    <Suspense>
      <PredictionDetailInner />
    </Suspense>
  );
}
