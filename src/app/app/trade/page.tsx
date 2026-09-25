"use client";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { useMarkets } from "@/components/useMarkets";
import { useVault, posOf } from "@/components/useVault";
import { ActionButton } from "@/components/app/ActionButton";
import { AmountField, GasNote, PageHead, Row, Seg, StickyAction, TestNote, TickerChips, TokenDot, TxModal } from "@/components/app/ui";
import { units, usd, pct, dateUTC, srcLabel } from "@/lib/format";
import { FEE_BPS, USDC_DECIMALS, X_DECIMALS, fromRaw, swapOut, toRaw } from "@/lib/vault/sdk";

const SLIPS = [0.005, 0.01, 0.02];

function TradeInner() {
  const sp = useSearchParams();
  const { data, get } = useMarkets();
  const v = useVault();
  const [x, setX] = useState(sp.get("x") ?? "SPYx");
  const [side, setSide] = useState<"sell" | "buy">(sp.get("side") === "buy" ? "buy" : "sell");
  const [amt, setAmt] = useState("");
  const [slip, setSlip] = useState(0.01);
  const m = get(x);
  const cm = v.markets[x];
  const pos = posOf(v, x);
  const tradable = (data?.markets ?? []).filter((k) => (v.loaded ? v.markets[k.x]?.hasPool : k.trailingYield > 0));
  const n = Number(amt) || 0;
  const inDec = side === "sell" ? X_DECIMALS : USDC_DECIMALS;
  const outDec = side === "sell" ? USDC_DECIMALS : X_DECIMALS;
  const rIn = side === "sell" ? cm?.reserveD ?? 0n : cm?.reserveUsdc ?? 0n;
  const rOut = side === "sell" ? cm?.reserveUsdc ?? 0n : cm?.reserveD ?? 0n;
  const rawIn = toRaw(n, inDec);
  const rawOut = swapOut(rawIn, rIn, rOut);
  const out = fromRaw(rawOut, outDec);
  const minRaw = (rawOut * BigInt(Math.round((1 - slip) * 10_000))) / 10_000n;
  const mid = cm?.poolPrice ?? null; // USDC per coupon
  const exec = n > 0 && out > 0 ? (side === "sell" ? out / n : n / out) : null;
  const impact = exec && mid ? Math.abs(exec / mid - 1) : null;
  const balIn = side === "sell" ? fromRaw(pos.d, X_DECIMALS) : fromRaw(v.usdc, USDC_DECIMALS);
  const max = balIn;
  const hasPool = !!cm?.hasPool;
  const bad = !hasPool || n <= 0 || rawOut === 0n || (!!v.owner && n > max + 1e-9);
  const cta = !hasPool ? (v.loaded ? "No pool for this coupon" : "Loading pool") : n <= 0 ? "Enter an amount" : v.owner && n > max + 1e-9 ? (side === "sell" ? `Not enough d${x}` : "Not enough test USDC") : side === "sell" ? `Sell ${units(n, 2)} d${x}` : `Buy d${x} for ${usd(n)}`;

  const go = async () => {
    if (!v.vault || !v.owner || bad || !cm) return;
    const ixs = side === "sell" ? v.vault.swapSell(v.owner, cm.dep, rawIn, minRaw) : v.vault.swapBuy(v.owner, cm.dep, rawIn, minRaw);
    const ok = await v.run(side === "sell" ? `Sell ${units(n, 2)} d${x}` : `Buy d${x} with ${usd(n)}`, ixs, (sig) => ({
      action: side, symbol: x, sig, at: Date.now(), title: side === "sell" ? "Coupon sold" : "Coupon bought",
      lines: side === "sell"
        ? [["Sold", `${units(n, 4)} d${x}`], ["Average price", usd(exec, 4)], ["Minimum accepted", usd(fromRaw(minRaw, USDC_DECIMALS))], ["Received", `${units(out, 2)} test USDC`]]
        : [["Paid", `${units(n, 2)} test USDC`], ["Average price", usd(exec, 4)], ["Minimum accepted", `${units(fromRaw(minRaw, X_DECIMALS), 4)} d${x}`], ["Received", `${units(out, 4)} d${x}`]],
    }));
    if (ok) setAmt("");
  };

  const recent = (m?.bumps ?? []).filter((b) => Date.now() - new Date(b.at).getTime() < 365 * 864e5);
  const depthUsd = cm ? fromRaw(cm.reserveUsdc, USDC_DECIMALS) * 2 : null;
  const btn = <ActionButton label={cta} connectLabel="Connect a devnet wallet to trade" disabled={bad} onClick={go} />;

  return (
    <div className="pb-40 md:pb-0">
      <PageHead kicker="Trade dividends" title="Cash now," accent="or income later." sub="Sell a dividend coupon into its onchain pool and get paid today. Buy one and collect every bump until maturity." />
      <div className="mt-6 grid grid-cols-1 gap-4 sm:mt-8 lg:grid-cols-[1fr_1.05fr] lg:gap-5">
        {/* ticket */}
        <div className="card min-w-0 p-5 sm:p-7">
          <div className="mb-5 flex items-center justify-between gap-3 border-b border-line pb-5 lg:hidden">
            <div className="flex min-w-0 items-center gap-3">
              {m && <TokenDot m={m} size={40} />}
              <div className="min-w-0">
                <div className="display text-2xl leading-none">d{x}</div>
                <div className="mt-1 truncate text-xs text-dim">{m?.name ?? "…"} · devnet pool</div>
              </div>
            </div>
            <div className="grid shrink-0 grid-cols-2 gap-x-4 text-right">
              <span className="micro !text-[8px] text-faint">Pool</span>
              <span className="micro !text-[8px] text-lime">Fair</span>
              <span className="num whitespace-nowrap text-sm">{usd(mid, 3)}</span>
              <span className="num whitespace-nowrap text-sm text-lime">{usd(m?.fair, 3)}</span>
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Seg options={[["sell", "Sell dividends"], ["buy", "Buy dividends"]]} value={side} onChange={(s) => { setSide(s); setAmt(""); }} />
            <span className="num hidden text-xs text-dim sm:inline">{v.owner ? `USDC ${units(fromRaw(v.usdc, USDC_DECIMALS), 2)}` : "Devnet"}</span>
          </div>
          <div className="mt-4 sm:mt-5"><TickerChips markets={tradable} value={x} onChange={setX} /></div>
          <div className="mt-4 sm:mt-5">
            <AmountField label={side === "sell" ? `Sell d${x}` : "Pay test USDC"} value={amt} onChange={setAmt} max={max} suffix={side === "sell" ? `d${x}` : "USDC"} />
          </div>
          <div className="mt-4 rounded-2xl border border-line bg-bg/60 p-4 sm:mt-5 sm:p-5">
            <div className="micro !text-[9px] text-dim">{side === "sell" ? "You receive today" : "You receive"}</div>
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.div key={`${side}${out.toFixed(4)}`} initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -10, opacity: 0 }} transition={{ duration: 0.25 }} className="num mt-2 whitespace-nowrap text-[34px] leading-none text-lime sm:text-4xl">
                {side === "sell" ? usd(out) : `${units(out, 4)}`}<span className="ml-2 text-base text-dim">{side === "sell" ? "USDC" : `d${x}`}</span>
              </motion.div>
            </AnimatePresence>
            <div className="mt-4 divide-y divide-line border-t border-line">
              <Row k="Average price" v={exec ? usd(exec, 4) : usd(mid, 4)} />
              <Row k="Price impact" v={impact != null ? pct(impact, 2) : "…"} />
              <Row k={`Minimum received · ${pct(slip, 1)} slippage`} v={n > 0 ? (side === "sell" ? usd(fromRaw(minRaw, USDC_DECIMALS)) : `${units(fromRaw(minRaw, X_DECIMALS), 4)} d${x}`) : "…"} />
              <Row k="Pool fee" v={pct(FEE_BPS / 10_000, 2)} />
              {side === "buy" && <Row k="Projected units, 12m" v={m ? `${units(out * m.trailingYield, 6)} ${x}` : "…"} accent />}
            </div>
            <div className="mt-3 flex items-center justify-between gap-3">
              <span className="text-xs text-dim">Slippage tolerance</span>
              <div className="flex gap-1">
                {SLIPS.map((s) => (
                  <button key={s} onClick={() => setSlip(s)} aria-pressed={slip === s} className={`num h-11 rounded-full border px-3 text-xs sm:h-8 ${slip === s ? "border-lime text-lime" : "border-line-2 text-dim hover:text-ink"}`}>{pct(s, 1)}</button>
                ))}
              </div>
            </div>
          </div>
          {pos.d === 0n && side === "sell" && (
            <Link href={`/app/split?x=${x}`} className="mt-4 flex min-h-11 items-center justify-between gap-3 rounded-xl border border-dashed border-line-2 px-4 text-sm text-dim transition-colors hover:border-lime/50">
              <span>No d{x} yet</span>
              <span className="whitespace-nowrap text-lime">Split {x} first →</span>
            </Link>
          )}
          <div className="mt-5 hidden md:block">{btn}</div>
          <div className="mt-4 space-y-3"><GasNote sol={v.sol} /><TestNote>Trades settle in the d{x}/USDC constant product pool of the coupon_vault program on devnet, paid in test USDC. The fair value on the right uses live mainnet data and set the pool&apos;s opening price.</TestNote></div>
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
            <div className="micro !text-[9px] text-dim lg:mt-7">Pool depth · devnet</div>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {[
                [`d${x} reserve`, cm ? units(fromRaw(cm.reserveD, X_DECIMALS), 2) : "…"],
                ["USDC reserve", cm ? units(fromRaw(cm.reserveUsdc, USDC_DECIMALS), 2) : "…"],
                ["Depth", usd(depthUsd, 0)],
              ].map(([a, b], i) => (
                <div key={a} className={`min-w-0 rounded-xl border border-line bg-bg/50 px-4 py-3 ${i === 2 ? "col-span-2 sm:col-span-1" : ""}`}>
                  <div className="truncate text-xs text-dim">{a}</div>
                  <div className="num mt-1 truncate text-lg">{b}</div>
                </div>
              ))}
            </div>
            <div className="micro mt-6 !text-[9px] text-dim">Fair value from mainnet data</div>
            <div className="mt-3 space-y-2">
              {[
                [`${x} price`, usd(m?.xPrice), m ? srcLabel(m.priceSource) : ""],
                ["× Trailing 12m growth", pct(m?.trailingYield, 4), `${recent.length} real bumps`],
                ["= Fair value", usd(m?.fair, 4), "per coupon"],
                ["Pool price", usd(mid, 4), mid && m?.fair ? `${pct(mid / m.fair - 1, 1)} vs fair` : "onchain"],
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
            <p className="mt-5 text-sm leading-relaxed text-dim">The pool opened at the midpoint of an 8% seller discount and a 5% buyer discount to fair value. After that, only trades move the price.</p>
          </div>

          <div className="card min-w-0 p-5 sm:p-7">
            <div className="flex items-center justify-between gap-3">
              <div className="micro !text-[9px] text-dim">Last 12 months of {x} bumps · mainnet</div>
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

      <StickyAction label="You receive" value={side === "sell" ? usd(out) : `${units(out, 2)} d${x}`} accent>
        {btn}
      </StickyAction>
      <TxModal tx={v.tx} onClose={v.closeTx} />
    </div>
  );
}

export default function TradePage() {
  return <Suspense><TradeInner /></Suspense>;
}
