"use client";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { useMarkets } from "@/components/useMarkets";
import { useLedger } from "@/components/useLedger";
import { useReceiptFlow } from "@/components/app/useReceiptFlow";
import { AmountField, PageHead, PaperNote, ReceiptModal, Row, Seg, StickyAction, TickerChips, TokenDot } from "@/components/app/ui";
import { units, usd, pct, dateUTC, srcLabel } from "@/lib/format";
import { SELL_DISCOUNT, BUY_DISCOUNT } from "@/lib/markets";

function TradeInner() {
  const sp = useSearchParams();
  const { data, get } = useMarkets();
  const L = useLedger();
  const [x, setX] = useState(sp.get("x") ?? "SPYx");
  const [side, setSide] = useState<"sell" | "buy">(sp.get("side") === "buy" ? "buy" : "sell");
  const [amt, setAmt] = useState("");
  const flow = useReceiptFlow();
  const m = get(x);
  const pos = L.pos(x);
  const paying = (data?.markets ?? []).filter((k) => k.trailingYield > 0);
  const price = side === "sell" ? m?.bid : m?.ask;
  const n = Number(amt) || 0;
  const max = side === "sell" ? pos.d : price ? L.state.cash / price : 0;
  const total = price ? n * price : 0;
  const bad = !price || n <= 0 || n > max + 1e-9;
  const cta = !price ? "Waiting for price" : n <= 0 ? "Enter an amount" : n > max + 1e-9 ? (side === "sell" ? `Not enough d${x}` : "Not enough cash") : side === "sell" ? `Sell ${units(n, 2)} d${x}` : `Buy ${units(n, 2)} d${x}`;

  const go = () => {
    if (!price || bad) return;
    flow.open(side === "sell" ? L.sell(x, n, price) : L.buy(x, n, price));
    setAmt("");
  };

  const buyerReturn = m?.fair && m?.ask ? m.fair / m.ask - 1 : null;
  const recent = (m?.bumps ?? []).filter((b) => Date.now() - new Date(b.at).getTime() < 365 * 864e5);

  return (
    <div className="pb-40 md:pb-0">
      <PageHead kicker="Trade dividends" title="Cash now," accent="or income later." sub="Sell a dividend coupon at the bid and get paid today. Buy one at the ask and collect every bump until maturity." />
      <div className="mt-6 grid grid-cols-1 gap-4 sm:mt-8 lg:grid-cols-[1fr_1.05fr] lg:gap-5">
        {/* ticket */}
        <div className="card min-w-0 p-5 sm:p-7">
          {/* compact market strip, mobile first */}
          <div className="mb-5 flex items-center justify-between gap-3 border-b border-line pb-5 lg:hidden">
            <div className="flex min-w-0 items-center gap-3">
              {m && <TokenDot m={m} size={40} />}
              <div className="min-w-0">
                <div className="display text-2xl leading-none">d{x}</div>
                <div className="mt-1 truncate text-xs text-dim">{m?.name ?? "…"}</div>
              </div>
            </div>
            <div className="grid shrink-0 grid-cols-2 gap-x-4 text-right">
              <span className="micro !text-[8px] text-faint">Bid</span>
              <span className="micro !text-[8px] text-lime">Ask</span>
              <span className="num whitespace-nowrap text-sm">{usd(m?.bid, 3)}</span>
              <span className="num whitespace-nowrap text-sm text-lime">{usd(m?.ask, 3)}</span>
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Seg options={[["sell", "Sell dividends"], ["buy", "Buy dividends"]]} value={side} onChange={setSide} />
            <span className="num hidden text-xs text-dim sm:inline">Cash {usd(L.state.cash)}</span>
          </div>
          <div className="mt-4 sm:mt-5"><TickerChips markets={paying} value={x} onChange={setX} /></div>
          <div className="mt-4 sm:mt-5">
            <AmountField label={side === "sell" ? `Sell d${x}` : `Buy d${x}`} value={amt} onChange={setAmt} max={max} suffix={`d${x}`} />
          </div>
          <div className="mt-4 rounded-2xl border border-line bg-bg/60 p-4 sm:mt-5 sm:p-5">
            <div className="flex items-center justify-between gap-3">
              <div className="micro !text-[9px] text-dim">{side === "sell" ? "You receive today" : "You pay today"}</div>
              <span className="num text-[11px] text-faint sm:hidden">Cash {usd(L.state.cash)}</span>
            </div>
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.div key={`${side}${total.toFixed(2)}`} initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -10, opacity: 0 }} transition={{ duration: 0.25 }} className={`num mt-2 whitespace-nowrap text-[34px] leading-none sm:text-4xl ${side === "sell" ? "text-lime" : "text-ink"}`}>{usd(total)}</motion.div>
            </AnimatePresence>
            <div className="mt-4 divide-y divide-line border-t border-line">
              <Row k={side === "sell" ? "Bid per coupon" : "Ask per coupon"} v={usd(price, 4)} />
              <Row k="Fair value per coupon" v={usd(m?.fair, 4)} />
              <Row k={side === "sell" ? "Discount you give" : "Discount you get"} v={pct(side === "sell" ? SELL_DISCOUNT : BUY_DISCOUNT, 1)} accent={side === "buy"} />
              {side === "buy" && <Row k="Projected units, 12m" v={m ? `${units(n * m.trailingYield, 6)} ${x}` : "…"} accent />}
            </div>
          </div>
          {pos.d <= 0 && side === "sell" && (
            <Link href={`/app/split?x=${x}`} className="mt-4 flex min-h-11 items-center justify-between gap-3 rounded-xl border border-dashed border-line-2 px-4 text-sm text-dim transition-colors hover:border-lime/50">
              <span>No d{x} yet</span>
              <span className="whitespace-nowrap text-lime">Split {x} first →</span>
            </Link>
          )}
          <button disabled={bad} onClick={go} className="btn btn-lime mt-5 hidden h-[52px] w-full text-[15px] md:flex">
            {cta}{!bad && side === "sell" ? ` for ${usd(total)}` : ""}
          </button>
          <div className="mt-4"><PaperNote /></div>
        </div>

        {/* market info */}
        <div className="flex min-w-0 flex-col gap-4 lg:gap-5">
          <div className="card min-w-0 p-5 sm:p-7">
            <div className="hidden items-center gap-3 lg:flex">
              {m && <TokenDot m={m} size={44} />}
              <div>
                <div className="display text-3xl">d{x}</div>
                <div className="text-sm text-dim">12 month dividend coupon on {m?.name ?? "…"}</div>
              </div>
            </div>
            <div className="micro !text-[9px] text-dim lg:mt-7">How the price is built</div>
            <div className="mt-3 space-y-2">
              {[
                [`${x} price`, usd(m?.xPrice), m ? srcLabel(m.priceSource) : ""],
                ["× Trailing 12m growth", pct(m?.trailingYield, 4), `${recent.length} real bumps`],
                ["= Fair value", usd(m?.fair, 4), "per coupon"],
                [`Bid, fair × ${1 - SELL_DISCOUNT}`, usd(m?.bid, 4), "sellers get"],
                [`Ask, fair × ${1 - BUY_DISCOUNT}`, usd(m?.ask, 4), "buyers pay"],
              ].map(([a, b, c], i) => (
                <motion.div key={a} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }} className={`flex min-h-[52px] items-center justify-between gap-3 rounded-xl border px-4 py-2.5 text-sm ${i === 2 ? "border-lime/35 bg-lime/[0.06]" : "border-line bg-bg/50"}`}>
                  <span className="min-w-0">
                    <span className="block text-dim">{a}</span>
                    {c && <span className="num block text-[10px] text-faint">{c}</span>}
                  </span>
                  <span className={`num shrink-0 whitespace-nowrap ${i === 2 ? "text-lime" : "text-ink"}`}>{b}</span>
                </motion.div>
              ))}
            </div>
            {buyerReturn != null && <p className="mt-5 text-sm leading-relaxed text-dim">A buyer at the ask earns <span className="num text-lime">{pct(buyerReturn, 2)}</span> over the coupon price if the next 12 months match the last 12.</p>}
          </div>

          <div className="card min-w-0 p-5 sm:p-7">
            <div className="flex items-center justify-between gap-3">
              <div className="micro !text-[9px] text-dim">Last 12 months of {x} bumps</div>
              <span className="num text-[10px] text-faint">{recent.length} total</span>
            </div>
            <div className="mt-4 divide-y divide-line">
              {recent.slice().reverse().map((b) => (
                <div key={b.at} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-0.5 py-3 text-sm sm:grid-cols-[auto_1fr_auto]">
                  <span className="num whitespace-nowrap text-dim">{dateUTC(b.at)}</span>
                  <span className="num col-start-1 row-start-2 whitespace-nowrap text-xs text-faint sm:col-start-2 sm:row-start-1 sm:text-center sm:text-sm sm:text-ink">{b.prev.toFixed(6)} → {b.next.toFixed(6)}</span>
                  <span className="num row-span-2 whitespace-nowrap text-right text-lime sm:row-span-1">+{pct(b.next / b.prev - 1, 3)}</span>
                </div>
              ))}
            </div>
            <Link href={`/app/replay?x=${x}`} className="btn btn-line mt-5 h-11 w-full text-sm sm:w-auto sm:px-5">Replay on chain →</Link>
          </div>
        </div>
      </div>

      <StickyAction label={side === "sell" ? "You receive" : "You pay"} value={usd(total)} accent={side === "sell"}>
        <button disabled={bad} onClick={go} className="btn btn-lime h-[52px] w-full text-[15px]">{cta}</button>
      </StickyAction>
      <ReceiptModal r={flow.receipt} devnet={flow.devnet} onRetry={flow.retry} onClose={flow.close} />
    </div>
  );
}

export default function TradePage() {
  return <Suspense><TradeInner /></Suspense>;
}
