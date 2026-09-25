"use client";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { useMarkets } from "@/components/useMarkets";
import { useLedger } from "@/components/useLedger";
import { useReceiptFlow } from "@/components/app/useReceiptFlow";
import { AmountField, PageHead, PaperNote, ReceiptModal, Row, Seg, TickerChips, TokenDot } from "@/components/app/ui";
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

  const go = () => {
    if (!price) return;
    flow.open(side === "sell" ? L.sell(x, n, price) : L.buy(x, n, price));
    setAmt("");
  };

  const buyerReturn = m?.fair && m?.ask ? m.fair / m.ask - 1 : null;

  return (
    <div>
      <PageHead kicker="Trade dividends" title="Cash now," accent="or income later." sub="Sell a dividend coupon at the bid and get paid today. Buy one at the ask and collect every bump until maturity." />
      <div className="mt-8 grid gap-5 lg:grid-cols-[1fr_1.05fr]">
        <div className="card p-6 sm:p-7">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Seg options={[["sell", "Sell dividends"], ["buy", "Buy dividends"]]} value={side} onChange={setSide} />
            <span className="num text-xs text-dim">Cash {usd(L.state.cash)}</span>
          </div>
          <div className="mt-5"><TickerChips markets={paying} value={x} onChange={setX} /></div>
          <div className="mt-5">
            <AmountField label={side === "sell" ? `Sell d${x}` : `Buy d${x}`} value={amt} onChange={setAmt} max={max} suffix={`d${x}`} />
          </div>
          <div className="mt-5 rounded-2xl border border-line bg-bg/60 p-5">
            <div className="micro !text-[9px] text-dim">{side === "sell" ? "You receive today" : "You pay today"}</div>
            <AnimatePresence mode="popLayout">
              <motion.div key={`${side}${total.toFixed(2)}`} initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -10, opacity: 0 }} transition={{ duration: 0.25 }} className={`num mt-2 text-4xl ${side === "sell" ? "text-lime" : "text-ink"}`}>{usd(total)}</motion.div>
            </AnimatePresence>
            <div className="mt-4 divide-y divide-line border-t border-line">
              <Row k={side === "sell" ? "Bid per coupon" : "Ask per coupon"} v={usd(price, 4)} />
              <Row k="Fair value per coupon" v={usd(m?.fair, 4)} />
              <Row k={side === "sell" ? "Discount you give" : "Discount you get"} v={pct(side === "sell" ? SELL_DISCOUNT : BUY_DISCOUNT, 1)} accent={side === "buy"} />
              {side === "buy" && <Row k="Projected units to you, 12m" v={m ? `${units(n * m.trailingYield, 6)} ${x}` : "…"} accent />}
            </div>
          </div>
          {pos.d <= 0 && side === "sell" && <div className="mt-4 text-sm text-dim">No d{x} yet. <Link href={`/app/split?x=${x}`} className="text-lime underline-offset-4 hover:underline">Split {x} first</Link>.</div>}
          <button disabled={bad} onClick={go} className="btn btn-lime mt-5 h-[52px] w-full text-[15px]">
            {!price ? "Waiting for price" : n <= 0 ? "Enter an amount" : n > max + 1e-9 ? (side === "sell" ? `Not enough d${x}` : "Not enough cash") : side === "sell" ? `Sell ${units(n, 2)} d${x} for ${usd(total)}` : `Buy ${units(n, 2)} d${x}`}
          </button>
          <div className="mt-4"><PaperNote /></div>
        </div>

        <div className="flex flex-col gap-5">
          <div className="card p-6 sm:p-7">
            <div className="flex items-center gap-3">
              {m && <TokenDot m={m} size={44} />}
              <div>
                <div className="display text-3xl">d{x}</div>
                <div className="text-sm text-dim">12 month dividend coupon on {m?.name ?? "…"}</div>
              </div>
            </div>
            <div className="micro mt-7 !text-[9px] text-dim">How the price is built</div>
            <div className="mt-3 space-y-2">
              {[
                [`${x} price`, usd(m?.xPrice), m ? srcLabel(m.priceSource) : ""],
                ["× Trailing 12m multiplier growth", pct(m?.trailingYield, 4), `${m?.bumps.filter((b) => Date.now() - new Date(b.at).getTime() < 365 * 864e5).length ?? "…"} real bumps`],
                ["= Fair value per coupon", usd(m?.fair, 4), ""],
                [`Bid (fair × ${1 - SELL_DISCOUNT})`, usd(m?.bid, 4), "sellers"],
                [`Ask (fair × ${1 - BUY_DISCOUNT})`, usd(m?.ask, 4), "buyers"],
              ].map(([a, b, c], i) => (
                <motion.div key={a} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.06 }} className={`flex items-center justify-between rounded-xl border px-4 py-3 text-sm ${i === 2 ? "border-lime/35 bg-lime/[0.06]" : "border-line bg-bg/50"}`}>
                  <span className="text-dim">{a} {c && <span className="num ml-1 text-[10px] text-faint">{c}</span>}</span>
                  <span className={`num ${i === 2 ? "text-lime" : "text-ink"}`}>{b}</span>
                </motion.div>
              ))}
            </div>
            {buyerReturn != null && <div className="mt-5 text-sm text-dim">A buyer at the ask earns <span className="num text-lime">{pct(buyerReturn, 2)}</span> over the coupon price if the next 12 months match the last 12.</div>}
          </div>
          <div className="card p-6 sm:p-7">
            <div className="micro !text-[9px] text-dim">Last 12 months of {x} bumps</div>
            <div className="mt-4 space-y-2">
              {(m?.bumps ?? []).slice(-4).reverse().map((b) => (
                <div key={b.at} className="flex items-center justify-between text-sm">
                  <span className="num text-dim">{dateUTC(b.at)}</span>
                  <span className="num text-ink">{b.prev.toFixed(6)} → {b.next.toFixed(6)}</span>
                  <span className="num text-lime">+{pct(b.next / b.prev - 1, 3)}</span>
                </div>
              ))}
            </div>
            <Link href={`/app/replay?x=${x}`} className="mt-5 inline-block text-sm text-lime underline-offset-4 hover:underline">Replay on chain →</Link>
          </div>
        </div>
      </div>
      <ReceiptModal r={flow.receipt} devnet={flow.devnet} onRetry={flow.retry} onClose={flow.close} />
    </div>
  );
}

export default function TradePage() {
  return <Suspense><TradeInner /></Suspense>;
}
