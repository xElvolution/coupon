"use client";
import Sk from "@/components/Sk";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { useMarkets } from "@/components/useMarkets";
import { useVault, posOf } from "@/components/useVault";
import { ActionButton } from "@/components/app/ActionButton";
import { AmountField, GasNote, PageHead, Row, Seg, StickyAction, TestNote, TickerChips, TokenDot, TxModal } from "@/components/app/ui";
import { units, usd, pct, dateUTC, srcLabel } from "@/lib/format";
import { FEE_BPS, USDC_DECIMALS, X_DECIMALS, fromRaw, swapOut, toRaw, type Side } from "@/lib/vault/sdk";

const SLIPS = [0.005, 0.01, 0.02];

function TradeInner() {
  const sp = useSearchParams();
  const { data, get } = useMarkets();
  const v = useVault();
  const [x, setX] = useState(sp.get("x") ?? "SPYx");
  const [side, setSide] = useState<"sell" | "buy">(sp.get("side") === "buy" ? "buy" : "sell");
  // which half of the split trades: the coupon (d, dividends) or the share (p, base units)
  const [kind, setKind] = useState<Side>(sp.get("kind") === "p" ? "p" : "d");
  const [amt, setAmt] = useState("");
  const [slip, setSlip] = useState(0.01);
  const m = get(x);
  const cm = v.markets[x];
  const pos = posOf(v, x);
  const tradable = (data?.markets ?? []).filter((k) => (kind === "p" ? (v.loaded ? v.markets[k.x]?.hasPPool : true) : v.loaded ? v.markets[k.x]?.hasPool : k.trailingYield > 0));
  const tk = `${kind}${x}`; // traded token symbol
  const rTok = kind === "d" ? cm?.reserveD ?? 0n : cm?.reserveP ?? 0n;
  const rUsd = kind === "d" ? cm?.reserveUsdc ?? 0n : cm?.reservePUsdc ?? 0n;
  // share fair value: base units at the xStock price minus the coupon's fair value
  const baseUnits = cm?.mBase ?? m?.multiplier ?? null;
  const baseValue = baseUnits != null && m?.xPrice != null ? baseUnits * m.xPrice : null;
  const fair = kind === "d" ? m?.fair ?? null : baseValue != null ? baseValue - (m?.fair ?? 0) : null;
  const n = Number(amt) || 0;
  const inDec = side === "sell" ? X_DECIMALS : USDC_DECIMALS;
  const outDec = side === "sell" ? USDC_DECIMALS : X_DECIMALS;
  const rIn = side === "sell" ? rTok : rUsd;
  const rOut = side === "sell" ? rUsd : rTok;
  const rawIn = toRaw(n, inDec);
  const rawOut = swapOut(rawIn, rIn, rOut);
  const out = fromRaw(rawOut, outDec);
  const minRaw = (rawOut * BigInt(Math.round((1 - slip) * 10_000))) / 10_000n;
  const mid = (kind === "d" ? cm?.poolPrice : cm?.pPoolPrice) ?? null; // USDC per token
  const exec = n > 0 && out > 0 ? (side === "sell" ? out / n : n / out) : null;
  const impact = exec && mid ? Math.abs(exec / mid - 1) : null;
  const balIn = side === "sell" ? fromRaw(kind === "d" ? pos.d : pos.p, X_DECIMALS) : fromRaw(v.usdc, USDC_DECIMALS);
  const max = balIn;
  const hasPool = kind === "d" ? !!cm?.hasPool : !!cm?.hasPPool;
  const bad = !hasPool || n <= 0 || rawOut === 0n || (!!v.owner && n > max + 1e-9);
  const cta = !hasPool ? (v.loaded ? `No pool for ${tk}` : "Loading pool") : n <= 0 ? "Enter an amount" : v.owner && n > max + 1e-9 ? (side === "sell" ? `Not enough ${tk}` : "Not enough test USDC") : side === "sell" ? `Sell ${units(n, 2)} ${tk}` : `Buy ${tk} for ${usd(n)}`;

  const go = async () => {
    if (!v.vault || !v.owner || bad || !cm) return;
    const ixs = side === "sell" ? v.vault.swapSell(v.owner, cm.dep, rawIn, minRaw, kind) : v.vault.swapBuy(v.owner, cm.dep, rawIn, minRaw, kind);
    const noun = kind === "d" ? "Coupon" : "Share";
    const ok = await v.run(side === "sell" ? `Sell ${units(n, 2)} ${tk}` : `Buy ${tk} with ${usd(n)}`, ixs, (sig) => ({
      action: side, symbol: x, sig, at: Date.now(), title: side === "sell" ? `${noun} sold` : `${noun} bought`,
      lines: side === "sell"
        ? [["Sold", `${units(n, 4)} ${tk}`], ["Average price", usd(exec, 4)], ["Minimum accepted", usd(fromRaw(minRaw, USDC_DECIMALS))], ["Received", `${units(out, 2)} test USDC`]]
        : [["Paid", `${units(n, 2)} test USDC`], ["Average price", usd(exec, 4)], ["Minimum accepted", `${units(fromRaw(minRaw, X_DECIMALS), 4)} ${tk}`], ["Received", `${units(out, 4)} ${tk}`]],
    }));
    if (ok) setAmt("");
  };

  const recent = (m?.bumps ?? []).filter((b) => Date.now() - new Date(b.at).getTime() < 365 * 864e5);
  const depthUsd = cm ? fromRaw(rUsd, USDC_DECIMALS) * 2 : null;
  const btn = <ActionButton label={cta} connectLabel="Connect a devnet wallet to trade" disabled={bad} onClick={go} />;

  return (
    <div className="pb-40 md:pb-0">
      <PageHead kicker="Trade" title="Cash now," accent="or income later." sub="Sell a dividend coupon into its onchain pool and get paid today, or trade the share on its own: base units without the dividends, priced below the stock." />
      <div className="mt-6 grid grid-cols-1 gap-4 sm:mt-8 lg:grid-cols-[1fr_1.05fr] lg:gap-5">
        {/* ticket */}
        <div className="card min-w-0 p-5 sm:p-7">
          <div className="mb-5 flex items-center justify-between gap-3 border-b border-line pb-5 lg:hidden">
            <div className="flex min-w-0 items-center gap-3">
              {m && <TokenDot m={m} size={40} badge={kind} />}
              <div className="min-w-0">
                <div className="display text-2xl leading-none">{tk}</div>
                <div className="mt-1 truncate text-xs text-dim">{m?.name ?? <Sk />} · devnet pool</div>
              </div>
            </div>
            <div className="grid shrink-0 grid-cols-2 gap-x-4 text-right">
              <span className="micro !text-[8px] text-faint">Pool</span>
              <span className="micro !text-[8px] text-lime">Fair</span>
              <span className="num whitespace-nowrap text-sm">{usd(mid, 3)}</span>
              <span className="num whitespace-nowrap text-sm text-lime">{usd(fair, kind === "d" ? 3 : 2)}</span>
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 flex-col gap-2 sm:flex-row">
            <Seg options={[["d", "Coupon"], ["p", "Share"]]} value={kind} onChange={(k) => { setKind(k); setAmt(""); }} />
            <Seg options={[["sell", kind === "d" ? "Sell dividends" : "Sell share"], ["buy", kind === "d" ? "Buy dividends" : "Buy share"]]} value={side} onChange={(s) => { setSide(s); setAmt(""); }} />
            </div>
            <span className="num hidden text-xs text-dim xl:inline">{v.owner ? `USDC ${units(fromRaw(v.usdc, USDC_DECIMALS), 2)}` : "Devnet"}</span>
          </div>
          <div className="mt-4 sm:mt-5"><TickerChips markets={tradable} value={x} onChange={setX} /></div>
          <div className="mt-4 sm:mt-5">
            <AmountField label={side === "sell" ? `Sell ${tk}` : "Pay test USDC"} value={amt} onChange={setAmt} max={max} suffix={side === "sell" ? tk : "USDC"} />
          </div>
          <div className="mt-4 rounded-2xl border border-line bg-bg/60 p-4 sm:mt-5 sm:p-5">
            <div className="micro !text-[9px] text-dim">{side === "sell" ? "You receive today" : "You receive"}</div>
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.div key={`${side}${out.toFixed(4)}`} initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -10, opacity: 0 }} transition={{ duration: 0.25 }} className="num mt-2 whitespace-nowrap text-[34px] leading-none text-lime sm:text-4xl">
                {side === "sell" ? usd(out) : `${units(out, 4)}`}<span className="ml-2 text-base text-dim">{side === "sell" ? "USDC" : tk}</span>
              </motion.div>
            </AnimatePresence>
            <div className="mt-4 divide-y divide-line border-t border-line">
              <Row k="Average price" v={exec ? usd(exec, 4) : usd(mid, 4)} />
              <Row k="Price impact" v={impact != null ? pct(impact, 2) : "Enter an amount"} />
              <Row k={`Minimum received · ${pct(slip, 1)} slippage`} v={n > 0 ? (side === "sell" ? usd(fromRaw(minRaw, USDC_DECIMALS)) : `${units(fromRaw(minRaw, X_DECIMALS), 4)} ${tk}`) : "Enter an amount"} />
              <Row k="Pool fee" v={pct(FEE_BPS / 10_000, 2)} />
              {side === "buy" && kind === "d" && <Row k="Projected units, 12m" v={m ? `${units(out * m.trailingYield, 6)} ${x}` : <Sk />} accent />}
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
          {(kind === "d" ? pos.d : pos.p) === 0n && side === "sell" && (
            <Link href={`/app/split?x=${x}`} className="mt-4 flex min-h-11 items-center justify-between gap-3 rounded-xl border border-dashed border-line-2 px-4 text-sm text-dim transition-colors hover:border-lime/50">
              <span>No {tk} yet</span>
              <span className="whitespace-nowrap text-lime">Split {x} first →</span>
            </Link>
          )}
          <div className="mt-5 hidden md:block">{btn}</div>
          <div className="mt-4 space-y-3"><GasNote sol={v.sol} /><TestNote>Trades settle in the {tk}/USDC constant product pool of the coupon_market program on devnet, paid in test USDC. The fair value on the right uses live mainnet data and set the pool&apos;s opening price.</TestNote></div>
        </div>

        {/* market info */}
        <div className="flex min-w-0 flex-col gap-4 lg:gap-5">
          <div className="card min-w-0 p-5 sm:p-7">
            <div className="hidden items-center gap-3 lg:flex">
              {m && <TokenDot m={m} size={44} badge={kind} />}
              <div>
                <div className="display text-3xl">{tk}</div>
                <div className="text-sm text-dim">{kind === "d" ? "12 month dividend coupon" : "Share: base units, no dividends for 12 months"} on {m?.name ?? <Sk />}</div>
              </div>
            </div>
            <div className="micro !text-[9px] text-dim lg:mt-7">Pool depth · devnet</div>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {[
                [`${tk} reserve`, cm ? units(fromRaw(rTok, X_DECIMALS), 2) : <Sk />],
                ["USDC reserve", cm ? units(fromRaw(rUsd, USDC_DECIMALS), 2) : <Sk />],
                ["Depth", usd(depthUsd, 0)],
              ].map(([a, b], i) => (
                <div key={String(a)} className={`min-w-0 rounded-xl border border-line bg-bg/50 px-4 py-3 ${i === 2 ? "col-span-2 sm:col-span-1" : ""}`}>
                  <div className="truncate text-xs text-dim">{a}</div>
                  <div className="num mt-1 truncate text-lg">{b}</div>
                </div>
              ))}
            </div>
            <div className="micro mt-6 !text-[9px] text-dim">Fair value from mainnet data</div>
            <div className="mt-3 space-y-2">
              {(kind === "d"
                ? [
                    [`${x} price`, usd(m?.xPrice), m ? srcLabel(m.priceSource) : ""],
                    ["× Trailing 12m growth", pct(m?.trailingYield, 4), `${recent.length} real bumps`],
                    ["= Fair value", usd(fair, 4), "per coupon"],
                    ["Pool price", usd(mid, 4), mid && fair ? `${pct(mid / fair - 1, 1)} vs fair` : "onchain"],
                  ]
                : [
                    [`${x} price × base units`, usd(baseValue), m && baseUnits != null ? `${srcLabel(m.priceSource)} · ${baseUnits.toFixed(6)} units` : ""],
                    ["− Coupon fair value", usd(m?.fair, 4), "12m dividends stay with d"],
                    ["= Fair value", usd(fair, 2), "per share"],
                    ["Pool price", usd(mid, 2), mid && fair ? `${pct(mid / fair - 1, 1)} vs fair` : "onchain"],
                  ]
              ).map(([a, b, c], i) => (
                <motion.div key={a} initial={{ x: -8 }} animate={{ x: 0 }} transition={{ delay: i * 0.05 }} className={`flex min-h-[52px] items-center justify-between gap-3 rounded-xl border px-4 py-2.5 text-sm ${i === 2 ? "border-lime/35 bg-lime/[0.06]" : "border-line bg-bg/50"}`}>
                  <span className="min-w-0">
                    <span className="block text-dim">{a}</span>
                    {c && <span className="num block text-[10px] text-faint">{c}</span>}
                  </span>
                  <span className={`num shrink-0 whitespace-nowrap ${i === 2 ? "text-lime" : "text-ink"}`}>{b}</span>
                </motion.div>
              ))}
            </div>
            <p className="mt-5 text-sm leading-relaxed text-dim">{kind === "d" ? "The pool opened at the midpoint of an 8% seller discount and a 5% buyer discount to fair value." : "The share pool opened at fair value. A share redeems for its base units at maturity."} After that, only trades move the price.</p>
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

      <StickyAction label="You receive" value={side === "sell" ? usd(out) : `${units(out, 2)} ${tk}`} accent>
        {btn}
      </StickyAction>
      <TxModal tx={v.tx} onClose={v.closeTx} />
    </div>
  );
}

export default function TradePage() {
  return <Suspense><TradeInner /></Suspense>;
}
