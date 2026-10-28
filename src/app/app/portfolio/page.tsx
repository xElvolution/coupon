"use client";
import Sk from "@/components/Sk";
import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { useMarkets } from "@/components/useMarkets";
import { useVault } from "@/components/useVault";
import { GasNote, PageHead, TestNote, TokenDot, TxModal } from "@/components/app/ui";
import { units, usd, short } from "@/lib/format";
import { getJSON } from "@/lib/api";
import { USDC_DECIMALS, X_DECIMALS, fromRaw } from "@/lib/vault/sdk";
import { explorerAddr, explorerTx } from "@/lib/vault/deployment";

interface Holding { x: string; mint: string; baseUnits: number; uiAmount: number }

export default function Portfolio() {
  const { data, get } = useMarkets();
  const v = useVault();
  const { setVisible } = useWalletModal();
  const { publicKey } = useWallet();
  const [chain, setChain] = useState<{ state: "idle" | "loading" | "ok" | "err"; h: Holding[] }>({ state: "idle", h: [] });
  useEffect(() => {
    if (!publicKey) { setChain({ state: "idle", h: [] }); return; }
    setChain({ state: "loading", h: [] });
    getJSON<{ ok: boolean; holdings: typeof chain.h }>(`/api/holdings?owner=${publicKey.toBase58()}`).then((j) => setChain(j.ok ? { state: "ok", h: j.holdings } : { state: "err", h: [] })).catch(() => setChain({ state: "err", h: [] }));
  }, [publicKey]);

  const f = (b: bigint) => fromRaw(b, X_DECIMALS);
  const cash = fromRaw(v.usdc, USDC_DECIMALS);
  const rows = Object.entries(v.positions).filter(([, p]) => p.x > 0n || p.p > 0n || p.d > 0n || p.lp > 0n);
  let total = cash, dVal = 0, proj = 0, claim = 0;
  const val = (x: string) => {
    const m = get(x), cm = v.markets[x], p = v.positions[x];
    if (!m?.xPrice || !cm || !p) return null;
    const xUi = f(p.x) * (cm.multiplier ?? 1);
    const pUi = f(p.p) * (cm.mBase ?? 1);
    const dv = f(p.d) * (cm.poolPrice ?? 0);
    return { total: (xUi + pUi) * m.xPrice + dv, dv, proj: f(p.d) * m.trailingYield * m.xPrice, claim: f(p.claimable) * (cm.multiplier ?? 1) * m.xPrice };
  };
  for (const [x] of rows) {
    const r = val(x);
    if (!r) continue;
    total += r.total; dVal += r.dv; proj += r.proj; claim += r.claim;
  }
  const hist = v.history;

  return (
    <div>
      <PageHead kicker="Portfolio" title="Everything you hold," accent="split two ways." right={v.owner ? <a href={explorerAddr(v.owner.toBase58())} target="_blank" rel="noreferrer" className="btn btn-line h-11 px-4 text-xs md:h-9">Wallet on Explorer ↗</a> : undefined} />
      {!v.owner && (
        <div className="card mt-6 flex flex-col gap-4 p-5 sm:mt-8 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div><div className="display text-2xl">Read only preview</div><p className="mt-1 text-sm text-dim">Connect a devnet wallet to see your test xStocks, coupons and USDC read from chain.</p></div>
          <button onClick={() => setVisible(true)} className="btn btn-lime h-11 shrink-0 px-5 text-sm">Connect a devnet wallet</button>
        </div>
      )}
      {v.owner && <div className="mt-6"><GasNote sol={v.sol} /></div>}
      <div className="mt-6 grid grid-cols-2 gap-3 sm:mt-8 sm:gap-4 lg:grid-cols-4">
        {[
          ["Devnet holdings", v.owner ? usd(data ? total : null) : "Connect wallet", "valued at live mainnet prices"],
          ["Test USDC", v.owner ? usd(cash) : "Connect wallet", "devnet"],
          ["Coupons, at pool price", v.owner ? usd(data ? dVal : null) : "Connect wallet", "d tokens"],
          ["Projected 12m income", v.owner ? usd(data ? proj : null) : "Connect wallet", claim > 0 ? `${usd(claim)} claimable now` : "from coupons you hold"],
        ].map(([a, b, c], i) => (
          <motion.div key={String(a)} initial={{ y: 14 }} animate={{ y: 0 }} transition={{ delay: i * 0.05 }} className={`card min-w-0 p-4 sm:p-5 ${i === 0 || i === 3 ? "col-span-2 sm:col-span-1" : ""}`}>
            <div className="micro !text-[9px] text-dim">{a}</div>
            <div className={`num mt-3 whitespace-nowrap ${i === 0 ? "text-3xl sm:text-2xl" : "text-lg sm:text-2xl"} ${i === 3 ? "text-lime" : "text-ink"}`}>{b}</div>
            <div className="mt-1 text-xs text-faint">{c}</div>
          </motion.div>
        ))}
      </div>

      <div className="card mt-4 overflow-hidden">
        <div className="flex items-center justify-between border-b border-line px-6 py-4">
          <div className="display text-2xl">Positions</div>
          <span className="micro !text-[9px] text-share">Devnet · read from chain</span>
        </div>
        <div className="hidden grid-cols-[1.4fr_1fr_1fr_1fr_1.2fr_1fr] gap-3 border-b border-line px-6 py-3 md:grid">
          {["Asset", "Test xStock", "Share p", "Coupon d", "Value", ""].map((h) => <div key={h} className="micro !text-[9px] text-faint">{h}</div>)}
        </div>
        {v.owner && rows.length === 0 && <div className="px-6 py-10 text-center text-sm text-dim">Nothing here yet. <Link href="/app/faucet" className="inline-flex min-h-11 items-center text-lime">Claim test tokens from the faucet</Link>.</div>}
        {!v.owner && <div className="px-6 py-10 text-center text-sm text-dim">Connect a devnet wallet to load positions.</div>}
        {rows.map(([x, p]) => {
          const m = get(x);
          const r = val(x);
          return (
            <div key={x} className="grid grid-cols-3 items-center gap-3 border-b border-line px-6 py-4 last:border-0 md:grid-cols-[1.4fr_1fr_1fr_1fr_1.2fr_1fr]">
              <div className="col-span-2 flex min-w-0 items-center gap-3 md:col-span-1">{m && <TokenDot m={m} />}<div className="min-w-0"><div className="num text-ink">{x}</div><div className="truncate text-xs text-dim">{m?.name} · test</div></div></div>
              <div className="num text-right text-sm md:order-5 md:text-left">{usd(r?.total)}</div>
              <div className="min-w-0"><div className="micro !text-[8px] text-faint md:hidden">{x}</div><div className="num truncate text-sm">{units(f(p.x), 4)}</div></div>
              <div className="min-w-0"><div className="micro !text-[8px] text-faint md:hidden">p{x}</div><div className="num flex min-w-0 items-center gap-1.5 truncate text-sm text-share">{m && <TokenDot m={m} size={18} badge="p" />}{units(f(p.p), 4)}</div></div>
              <div className="min-w-0"><div className="micro !text-[8px] text-faint md:hidden">d{x}</div><div className="num flex min-w-0 items-center gap-1.5 truncate text-sm text-lime">{m && <TokenDot m={m} size={18} badge="d" />}{units(f(p.d), 4)}</div></div>
              <div className="col-span-3 flex justify-end gap-2 md:order-6 md:col-span-1"><Link href={`/app/split?x=${x}`} className="btn btn-line h-11 flex-1 px-4 text-xs md:h-8 md:flex-none md:px-3">Split</Link><Link href={`/app/trade?x=${x}`} className="btn btn-lime h-11 flex-1 px-4 text-xs md:h-8 md:flex-none md:px-3">Trade</Link></div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        <div className="card overflow-hidden">
          <div className="border-b border-line px-6 py-4"><div className="display text-2xl">Transactions</div></div>
          {hist.length === 0 && <div className="px-6 py-10 text-center text-sm text-dim">No devnet transactions from this browser yet. <Link href="/app/split" className="inline-flex min-h-11 items-center text-lime">Split your first test xStock</Link>.</div>}
          {hist.slice(0, 12).map((r) => (
            <a key={r.sig} href={explorerTx(r.sig)} target="_blank" rel="noreferrer" className="flex min-h-12 items-center justify-between gap-3 border-b border-line px-6 py-3 text-sm last:border-0 hover:bg-surface-2/50">
              <div className="flex min-w-0 items-center gap-3">
                {get(r.symbol) && <TokenDot m={get(r.symbol)!} size={22} badge={r.badge} />}
                <span className={`micro shrink-0 rounded-full border px-2 py-0.5 !text-[9px] ${r.action === "sell" || r.action === "claim" ? "border-lime/40 text-lime" : "border-line-2 text-dim"}`}>{r.action}</span>
                <span className="num truncate">{r.lines[r.lines.length - 1]?.[1]}</span>
              </div>
              <span className="num shrink-0 text-xs text-lime">{short(r.sig, 4, 4)} ↗</span>
            </a>
          ))}
        </div>
        <div className="card p-6">
          <div className="flex items-center justify-between"><div className="display text-2xl">Mainnet wallet</div><span className="micro !text-[9px] text-lime">Read only</span></div>
          <p className="mt-2 text-sm text-dim">Real xStock balances for your connected address, read from Solana mainnet. COUPON never moves mainnet tokens.</p>
          <div className="mt-5">
            {!publicKey && <div className="rounded-xl border border-dashed border-line-2 px-4 py-6 text-center text-sm text-dim">Connect a wallet to read your xStocks.</div>}
            {chain.state === "loading" && <div className="text-sm text-dim">Reading mainnet</div>}
            {chain.state === "err" && <div className="text-sm text-dim">Mainnet read failed. Try again shortly.</div>}
            {chain.state === "ok" && chain.h.length === 0 && <div className="rounded-xl border border-line px-4 py-4 text-sm text-dim">No xStocks found at {short(publicKey!.toBase58())} on mainnet.</div>}
            {chain.h.map((h) => (
              <div key={h.x} className="flex items-center justify-between border-b border-line py-3 text-sm last:border-0"><span className="num">{h.x}</span><span className="num">{units(h.uiAmount, 6)}</span></div>
            ))}
          </div>
          <div className="mt-5"><TestNote /></div>
        </div>
      </div>
      <TxModal tx={v.tx} onClose={v.closeTx} />
    </div>
  );
}
