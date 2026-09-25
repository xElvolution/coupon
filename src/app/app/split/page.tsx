"use client";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { useMarkets } from "@/components/useMarkets";
import { useLedger } from "@/components/useLedger";
import { useReceiptFlow } from "@/components/app/useReceiptFlow";
import { AmountField, PageHead, PaperNote, ReceiptModal, Row, Seg, TickerChips } from "@/components/app/ui";
import { Rosette } from "@/components/Guilloche";
import { units, usd, pct } from "@/lib/format";

function SplitInner() {
  const sp = useSearchParams();
  const { data, get } = useMarkets();
  const L = useLedger();
  const [x, setX] = useState(sp.get("x") ?? "SPYx");
  const [mode, setMode] = useState<"split" | "redeem">("split");
  const [amt, setAmt] = useState(sp.get("amt") ?? "");
  const flow = useReceiptFlow();
  const m = get(x);
  const pos = L.pos(x);
  const paying = (data?.markets ?? []).filter((k) => k.trailingYield > 0);
  const n = Number(amt) || 0;
  const max = mode === "split" ? pos.x : Math.min(pos.p, pos.d);
  const bad = n <= 0 || n > max + 1e-9;
  const mult = m?.multiplier ?? null;
  useEffect(() => { if (Number(amt) > max && max > 0 && sp.get("amt")) setAmt(String(max)); /* clamp deep link */ // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [max]);

  const go = () => {
    const r = mode === "split" ? L.split(x, n, mult) : L.redeem(x, n, mult);
    flow.open(r);
    setAmt("");
  };

  return (
    <div>
      <PageHead kicker="Split" title="Tear off" accent="the coupon." sub="Deposit an xStock. Get a share token that keeps the base units and a dividend token that collects every multiplier bump for 12 months." />
      <div className="mt-8 grid gap-5 lg:grid-cols-[1.05fr_1fr]">
        <div className="card p-6 sm:p-7">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Seg options={[["split", "Split"], ["redeem", "Recombine"]]} value={mode} onChange={setMode} />
            <span className="micro !text-[9px] text-share">Paper ledger</span>
          </div>
          <div className="mt-5"><TickerChips markets={paying} value={x} onChange={setX} /></div>
          <div className="mt-5">
            <AmountField label={mode === "split" ? `Deposit ${x}` : `Return p${x} + d${x}`} value={amt} onChange={setAmt} max={max} suffix={mode === "split" ? x : `p+d`} />
          </div>
          <div className="my-4 flex justify-center">
            <motion.div animate={{ rotate: mode === "split" ? 0 : 180 }} className="flex h-10 w-10 items-center justify-center rounded-full border border-line-2 bg-surface-2 text-lime">↓</motion.div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {mode === "split" ? (
              <>
                <div className="rounded-2xl border border-line-2 bg-surface-2 p-4"><div className="micro !text-[9px] text-share">Share token</div><div className="num mt-2 text-2xl">{units(n, 4)}</div><div className="num mt-1 text-sm text-dim">p{x}</div></div>
                <div className="rounded-2xl border border-lime/35 bg-lime/[0.06] p-4"><div className="micro !text-[9px] text-lime">Dividend token</div><div className="num mt-2 text-2xl text-lime">{units(n, 4)}</div><div className="num mt-1 text-sm text-dim">d{x}</div></div>
              </>
            ) : (
              <div className="col-span-2 rounded-2xl border border-line-2 bg-surface-2 p-4"><div className="micro !text-[9px] text-dim">You receive</div><div className="num mt-2 text-2xl">{units(n, 4)} {x}</div></div>
            )}
          </div>
          <div className="mt-5 divide-y divide-line border-t border-line">
            <Row k="Mainnet multiplier now" v={mult?.toFixed(9) ?? "…"} />
            <Row k="Base units recorded" v={mult ? units(n / mult, 6) : "…"} />
            <Row k="Projected 12m dividend units" v={m ? `${units(n * m.trailingYield, 6)} ${x}` : "…"} accent />
            <Row k="Coupon value at bid" v={m?.bid != null ? usd(n * m.bid) : "…"} />
          </div>
          <button disabled={bad} onClick={go} className="btn btn-lime mt-6 h-[52px] w-full text-[15px]">
            {n <= 0 ? "Enter an amount" : n > max + 1e-9 ? "Not enough balance" : mode === "split" ? `Split ${units(n, 2)} ${x}` : `Recombine into ${x}`}
          </button>
          <div className="mt-4"><PaperNote /></div>
        </div>

        <div className="flex flex-col gap-5">
          <div className="card relative overflow-hidden p-6 sm:p-7">
            <Rosette size={420} spin className="pointer-events-none absolute -right-28 -top-28 text-lime" opacity={0.07} />
            <div className="micro !text-[9px] text-dim">Your {x} ledger</div>
            <div className="mt-5 grid grid-cols-3 gap-3">
              {[[x, pos.x, "text-ink"], [`p${x}`, pos.p, "text-share"], [`d${x}`, pos.d, "text-lime"]].map(([k, v, c]) => (
                <div key={k as string} className="rounded-2xl border border-line bg-bg/60 p-4">
                  <div className="num text-xs text-dim">{k as string}</div>
                  <motion.div key={String(v)} initial={{ y: 8, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className={`num mt-2 text-xl ${c}`}>{units(v as number, 2)}</motion.div>
                </div>
              ))}
            </div>
            <div className="mt-6 text-sm text-dim">Owner <span className="num text-ink">{L.owner === "guest" ? "guest session" : `${L.owner.slice(0, 4)}…${L.owner.slice(-4)}`}</span></div>
          </div>
          <div className="card p-6 sm:p-7">
            <div className="micro !text-[9px] text-dim">How d{x} gets paid</div>
            <div className="display mt-3 text-2xl">Extra units = base units × (new − old multiplier)</div>
            <p className="mt-3 text-sm leading-relaxed text-dim">When Backed applies a dividend, the {x} multiplier steps up. The vault releases the added units to d{x} holders pro rata. {m && m.bumps.length > 0 && <>The last {x} bump took the multiplier from <span className="num text-ink">{m.bumps[m.bumps.length - 1].prev.toFixed(6)}</span> to <span className="num text-ink">{m.bumps[m.bumps.length - 1].next.toFixed(6)}</span>.</>}</p>
            <div className="mt-5 flex items-center justify-between rounded-xl border border-line bg-bg/60 px-4 py-3 text-sm"><span className="text-dim">Trailing 12m, onchain</span><span className="num text-lime">{pct(m?.trailingYield, 3)}</span></div>
          </div>
        </div>
      </div>
      <ReceiptModal r={flow.receipt} devnet={flow.devnet} onRetry={flow.retry} onClose={flow.close} />
    </div>
  );
}

export default function SplitPage() {
  return <Suspense><SplitInner /></Suspense>;
}
