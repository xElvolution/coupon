"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { useWallet } from "@solana/wallet-adapter-react";
import { useMarkets } from "@/components/useMarkets";
import { useLedger } from "@/components/useLedger";
import { PageHead, PaperNote, TokenDot } from "@/components/app/ui";
import { units, usd, short } from "@/lib/format";

interface Holding { x: string; mint: string; baseUnits: number; uiAmount: number }

export default function Portfolio() {
  const { data, get } = useMarkets();
  const L = useLedger();
  const { publicKey } = useWallet();
  const [chain, setChain] = useState<{ state: "idle" | "loading" | "ok" | "err"; h: Holding[] }>({ state: "idle", h: [] });
  useEffect(() => {
    if (!publicKey) { setChain({ state: "idle", h: [] }); return; }
    setChain({ state: "loading", h: [] });
    fetch(`/api/holdings?owner=${publicKey.toBase58()}`).then((r) => r.json()).then((j) => setChain(j.ok ? { state: "ok", h: j.holdings } : { state: "err", h: [] })).catch(() => setChain({ state: "err", h: [] }));
  }, [publicKey]);

  const rows = Object.entries(L.state.positions).filter(([, p]) => p.x > 1e-9 || p.p > 1e-9 || p.d > 1e-9);
  let total = L.state.cash, dVal = 0, proj = 0;
  for (const [x, p] of rows) {
    const m = get(x);
    if (!m?.xPrice) continue;
    total += (p.x + p.p) * m.xPrice + p.d * (m.bid ?? 0);
    dVal += p.d * (m.bid ?? 0);
    proj += p.d * m.trailingYield * m.xPrice;
  }

  return (
    <div>
      <PageHead kicker="Portfolio" title="Everything you hold," accent="split two ways." right={<button onClick={() => { if (confirm("Reset the paper ledger to its starting balances?")) L.reset(); }} className="btn btn-line h-9 px-4 text-xs">Reset ledger</button>} />
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Ledger value", usd(data ? total : null), "at live prices"],
          ["Cash", usd(L.state.cash), "paper USDC"],
          ["Coupons held, at bid", usd(data ? dVal : null), "d tokens"],
          ["Projected 12m income", usd(data ? proj : null), "from coupons you hold"],
        ].map(([a, b, c], i) => (
          <motion.div key={a} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className="card p-5">
            <div className="micro !text-[9px] text-dim">{a}</div>
            <div className={`num mt-3 text-2xl ${i === 3 ? "text-lime" : "text-ink"}`}>{b}</div>
            <div className="mt-1 text-xs text-faint">{c}</div>
          </motion.div>
        ))}
      </div>

      <div className="card mt-4 overflow-hidden">
        <div className="flex items-center justify-between border-b border-line px-6 py-4">
          <div className="display text-2xl">Ledger positions</div>
          <span className="micro !text-[9px] text-share">Paper ledger</span>
        </div>
        <div className="hidden grid-cols-[1.4fr_1fr_1fr_1fr_1.2fr_1fr] gap-3 border-b border-line px-6 py-3 md:grid">
          {["Asset", "xStock", "Share p", "Coupon d", "Value", ""].map((h) => <div key={h} className="micro !text-[9px] text-faint">{h}</div>)}
        </div>
        {rows.map(([x, p]) => {
          const m = get(x);
          const v = m?.xPrice ? (p.x + p.p) * m.xPrice + p.d * (m.bid ?? 0) : null;
          return (
            <div key={x} className="grid grid-cols-2 items-center gap-3 border-b border-line px-6 py-4 last:border-0 md:grid-cols-[1.4fr_1fr_1fr_1fr_1.2fr_1fr]">
              <div className="col-span-2 flex items-center gap-3 md:col-span-1">{m && <TokenDot m={m} />}<div><div className="num text-ink">{x}</div><div className="text-xs text-dim">{m?.name}</div></div></div>
              <div className="num text-sm">{units(p.x, 4)}</div>
              <div className="num text-sm text-share">{units(p.p, 4)}</div>
              <div className="num text-sm text-lime">{units(p.d, 4)}</div>
              <div className="num text-sm">{usd(v)}</div>
              <div className="flex justify-end gap-2"><Link href={`/app/split?x=${x}`} className="btn btn-line h-8 px-3 text-xs">Split</Link><Link href={`/app/trade?x=${x}`} className="btn btn-lime h-8 px-3 text-xs">Trade</Link></div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        <div className="card overflow-hidden">
          <div className="border-b border-line px-6 py-4"><div className="display text-2xl">Receipts</div></div>
          {L.state.receipts.length === 0 && <div className="px-6 py-10 text-center text-sm text-dim">No activity yet. <Link href="/app/split" className="text-lime">Split your first xStock</Link>.</div>}
          {L.state.receipts.slice(0, 12).map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-3 border-b border-line px-6 py-3.5 text-sm last:border-0">
              <div className="flex items-center gap-3">
                <span className={`micro rounded-full border px-2 py-0.5 !text-[9px] ${r.action === "sell" ? "border-lime/40 text-lime" : "border-line-2 text-dim"}`}>{r.action}</span>
                <span className="num">{units(r.amount, 4)} {r.action === "sell" || r.action === "buy" ? `d${r.x}` : r.x}</span>
              </div>
              <div className="flex items-center gap-4">
                {r.cash != null && <span className={`num ${r.cash > 0 ? "text-lime" : "text-dim"}`}>{r.cash > 0 ? "+" : ""}{usd(r.cash)}</span>}
                {r.devnetSig ? (
                  <a href={`https://explorer.solana.com/tx/${r.devnetSig}?cluster=devnet`} target="_blank" rel="noreferrer" className="num hidden text-xs text-lime hover:underline sm:inline">devnet {short(r.devnetSig, 4, 4)} ↗</a>
                ) : (
                  <span className="num hidden text-xs text-faint sm:inline">{short(r.id, 5, 4)}</span>
                )}
              </div>
            </div>
          ))}
        </div>
        <div className="card p-6">
          <div className="flex items-center justify-between"><div className="display text-2xl">Mainnet wallet</div><span className="micro !text-[9px] text-lime">Read only</span></div>
          <p className="mt-2 text-sm text-dim">Real xStock balances for your connected address, read from Solana mainnet.</p>
          <div className="mt-5">
            {!publicKey && <div className="rounded-xl border border-dashed border-line-2 px-4 py-6 text-center text-sm text-dim">Connect a wallet to read your xStocks.</div>}
            {chain.state === "loading" && <div className="text-sm text-dim">Reading mainnet…</div>}
            {chain.state === "err" && <div className="text-sm text-dim">Mainnet read failed. Try again shortly.</div>}
            {chain.state === "ok" && chain.h.length === 0 && <div className="rounded-xl border border-line px-4 py-4 text-sm text-dim">No xStocks found at {short(publicKey!.toBase58())} on mainnet.</div>}
            {chain.h.map((h) => (
              <div key={h.x} className="flex items-center justify-between border-b border-line py-3 text-sm last:border-0"><span className="num">{h.x}</span><span className="num">{units(h.uiAmount, 6)}</span></div>
            ))}
          </div>
          <div className="mt-5"><PaperNote /></div>
        </div>
      </div>
    </div>
  );
}
