"use client";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

/** Fixed layers render into body so page transitions never become their containing block. */
function Portal({ children }: { children: React.ReactNode }) {
  const [el, setEl] = useState<HTMLElement | null>(null);
  useEffect(() => setEl(document.body), []);
  return el ? createPortal(children, el) : null;
}
import type { MarketSnapshot } from "@/lib/types";
import type { Receipt } from "../useLedger";
import { units, usd, short } from "@/lib/format";
import type { DevnetState } from "./useReceiptFlow";

export function PageHead({ kicker, title, accent, sub, right }: { kicker: string; title: string; accent?: string; sub?: string; right?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-6">
      <div>
        <div className="micro text-lime">{kicker}</div>
        <h1 className="display mt-2 text-[clamp(2rem,5vw,3.6rem)] leading-[0.98] sm:mt-3">{title} {accent && <em className="text-lime">{accent}</em>}</h1>
        {sub && <p className="mt-2 max-w-xl text-[15px] leading-relaxed text-dim sm:mt-3 sm:text-base">{sub}</p>}
      </div>
      {right}
    </div>
  );
}

export function TokenDot({ m, size = 36 }: { m: Pick<MarketSnapshot, "under" | "hue">; size?: number }) {
  return (
    <span className="relative inline-flex shrink-0 items-center justify-center rounded-full border border-line-2 bg-surface-2 text-[10px] font-semibold text-ink" style={{ width: size, height: size }}>
      <span className="absolute inset-[3px] rounded-full opacity-35" style={{ background: m.hue }} />
      <span className="relative num">{m.under.slice(0, 4)}</span>
    </span>
  );
}

export function TickerChips({ markets, value, onChange, page = false }: { markets: MarketSnapshot[]; value: string; onChange: (x: string) => void; page?: boolean }) {
  return (
    <div className={`no-scrollbar flex snap-x gap-1.5 overflow-x-auto pb-1 ${page ? "-mx-4 scroll-px-4 px-4" : "-mx-5 scroll-px-5 px-5"} [mask-image:linear-gradient(90deg,transparent,#000_16px,#000_calc(100%-28px),transparent)] sm:mx-0 sm:px-0 sm:[mask-image:none]`}>
      {markets.map((m) => (
        <button key={m.x} onClick={() => onChange(m.x)} aria-pressed={value === m.x} className={`relative flex h-11 shrink-0 snap-start items-center rounded-full border px-4 text-sm transition-colors sm:h-9 sm:px-3.5 ${value === m.x ? "border-lime text-bg" : "border-line-2 text-dim hover:border-line-2 hover:text-ink"}`}>
          {value === m.x && <motion.span layoutId="chip" className="absolute inset-0 rounded-full bg-lime" transition={{ type: "spring", stiffness: 500, damping: 36 }} />}
          <span className="relative num">{m.x}</span>
        </button>
      ))}
    </div>
  );
}

export function Seg<T extends string>({ options, value, onChange }: { options: [T, string][]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="flex w-full rounded-full border border-line-2 bg-bg p-1 sm:inline-flex sm:w-auto">
      {options.map(([k, l]) => (
        <button key={k} onClick={() => onChange(k)} aria-pressed={value === k} className={`relative h-11 flex-1 whitespace-nowrap rounded-full px-4 text-sm transition-colors sm:h-9 sm:flex-none ${value === k ? "text-bg" : "text-dim hover:text-ink"}`}>
          {value === k && <motion.span layoutId={`seg-${options.map((o) => o[0]).join("")}`} className="absolute inset-0 rounded-full bg-ink" transition={{ type: "spring", stiffness: 500, damping: 36 }} />}
          <span className="relative">{l}</span>
        </button>
      ))}
    </div>
  );
}

export function AmountField({ label, value, onChange, max, suffix }: { label: string; value: string; onChange: (v: string) => void; max: number; suffix: string }) {
  return (
    <div className="min-w-0 rounded-2xl border border-line-2 bg-bg p-4 transition-colors focus-within:border-lime/60">
      <div className="flex items-center justify-between gap-3">
        <span className="micro min-w-0 truncate !text-[9px] text-dim">{label}</span>
        <button onClick={() => onChange(String(Math.floor(max * 1e4) / 1e4))} className="-my-2 -mr-2 flex h-11 shrink-0 items-center gap-1.5 rounded-full px-3 text-[11px] text-dim transition-colors hover:text-lime">
          <span className="num whitespace-nowrap">{units(max, 4)}</span>
          <span className="rounded-full border border-lime/40 px-2 py-0.5 font-semibold text-lime">Max</span>
        </button>
      </div>
      <div className="mt-2 flex min-w-0 items-center gap-3">
        <input inputMode="decimal" size={1} aria-label={label} value={value} onChange={(e) => onChange(e.target.value.replace(/[^0-9.]/g, ""))} placeholder="0.00" className="num h-12 min-w-0 flex-1 bg-transparent text-[34px] text-ink outline-none placeholder:text-faint sm:text-4xl" />
        <span className="num shrink-0 whitespace-nowrap rounded-full border border-line-2 px-3 py-1.5 text-sm text-ink">{suffix}</span>
      </div>
    </div>
  );
}

export function Row({ k, v, accent }: { k: string; v: React.ReactNode; accent?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5 text-sm">
      <span className="min-w-0 text-dim">{k}</span>
      <span className={`num shrink-0 whitespace-nowrap text-right ${accent ? "text-lime" : "text-ink"}`}>{v}</span>
    </div>
  );
}

export function PaperNote() {
  return (
    <div className="flex gap-3 rounded-xl border border-share/25 bg-share/[0.06] px-4 py-3 text-[13px] text-share">
      <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-share" />
      <span>Paper ledger. Prices and multipliers are real, vault balances live in this browser and no tokens move. With a wallet connected, each receipt is also signed onto Solana devnet as a memo transaction.</span>
    </div>
  );
}

const TITLES: Record<Receipt["action"], string> = { split: "Split recorded", redeem: "Redeem recorded", sell: "Coupon sold", buy: "Coupon bought" };

export function ReceiptModal({ r, onClose, devnet, onRetry }: { r: Receipt | null; onClose: () => void; devnet?: DevnetState; onRetry?: () => void }) {
  return (
    <Portal><AnimatePresence>
      {r && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} className="fixed inset-0 z-[80] flex items-center justify-center bg-bg/70 p-4 backdrop-blur-[14px]" onClick={onClose}>
          <motion.div initial={{ y: 24, scale: 0.97, opacity: 0 }} animate={{ y: 0, scale: 1, opacity: 1 }} exit={{ y: 12, opacity: 0 }} transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }} onClick={(e) => e.stopPropagation()} className="no-scrollbar relative max-h-[calc(100svh-32px)] w-full max-w-md overflow-y-auto">
            <div className="overflow-hidden rounded-t-[20px] border border-line-2 bg-surface p-7">
              <div className="flex items-center justify-between">
                <span className="micro text-lime">Ledger receipt</span>
                <motion.span initial={{ scale: 0, rotate: -40 }} animate={{ scale: 1, rotate: 0 }} transition={{ delay: 0.15, type: "spring", stiffness: 400, damping: 14 }} className="flex h-9 w-9 items-center justify-center rounded-full bg-lime text-bg">✓</motion.span>
              </div>
              <div className="display mt-4 text-4xl">{TITLES[r.action]}</div>
              <div className="mt-6 divide-y divide-line">
                <Row k="Asset" v={r.x} />
                {r.action === "split" && <><Row k="Deposited" v={`${units(r.amount)} ${r.x}`} /><Row k="Received" v={`${units(r.amount)} p${r.x} + ${units(r.amount)} d${r.x}`} accent /></>}
                {r.action === "redeem" && <><Row k="Returned" v={`${units(r.amount)} p${r.x} + d${r.x}`} /><Row k="Received" v={`${units(r.amount)} ${r.x}`} accent /></>}
                {r.action === "sell" && <><Row k="Sold" v={`${units(r.amount)} d${r.x}`} /><Row k="Price" v={usd(r.price, 4)} /><Row k="Cash received" v={usd(r.cash)} accent /></>}
                {r.action === "buy" && <><Row k="Bought" v={`${units(r.amount)} d${r.x}`} accent /><Row k="Price" v={usd(r.price, 4)} /><Row k="Cash paid" v={usd(-(r.cash ?? 0))} /></>}
                {r.multiplier != null && <Row k="Mainnet multiplier at entry" v={r.multiplier.toFixed(9)} />}
                <Row k="Time" v={new Date(r.at).toLocaleString()} />
              </div>
            </div>
            <div className="perf-h h-2 bg-surface" />
            <div className="rounded-b-[20px] border border-line-2 border-t-0 bg-surface px-7 pb-6 pt-4">
              <div className="micro !text-[9px] text-faint">Receipt id · paper ledger</div>
              <div className="num mt-1 break-all text-xs text-dim">{r.id}</div>
              <div className="mt-4 rounded-xl border border-line bg-bg/60 px-4 py-3 text-xs">
                <div className="micro !text-[9px] text-faint">Devnet record · memo transaction</div>
                {(!devnet || devnet.state === "idle" || devnet.state === "nowallet") && <div className="mt-1.5 text-dim">Connect a wallet to also sign this receipt onto Solana devnet.</div>}
                {devnet?.state === "pending" && <div className="mt-1.5 flex items-center gap-2 text-dim"><span className="live-dot h-1.5 w-1.5 rounded-full bg-lime" />Waiting for your wallet signature…</div>}
                {devnet?.state === "ok" && devnet.sig && <a href={`https://explorer.solana.com/tx/${devnet.sig}?cluster=devnet`} target="_blank" rel="noreferrer" className="num mt-1.5 flex items-center justify-between text-lime hover:underline"><span>{short(devnet.sig, 10, 10)}</span><span>↗</span></a>}
                {devnet?.state === "err" && <div className="mt-1.5 flex items-center justify-between gap-3 text-dim"><span>{devnet.error}</span>{onRetry && <button onClick={onRetry} className="shrink-0 text-lime hover:underline">Retry</button>}</div>}
              </div>
              <button onClick={onClose} className="btn btn-lime mt-5 h-11 w-full">Done</button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence></Portal>
  );
}

/** Mobile only: the primary action docks above the tab bar so the ticket is always reachable. */
export function StickyAction({ label, value, accent, children }: { label: string; value: string; accent?: boolean; children: React.ReactNode }) {
  return (
    <Portal><div className="fixed inset-x-0 bottom-[calc(max(12px,env(safe-area-inset-bottom))+66px)] z-30 px-3 md:hidden">
      <div className="rounded-2xl border border-line-2 bg-surface/95 p-2.5 shadow-[0_-12px_40px_-12px_rgba(0,0,0,.8)] backdrop-blur-[14px]">
        <div className="flex items-center justify-between gap-3 px-2 pb-2">
          <span className="micro !text-[9px] text-dim">{label}</span>
          <span className={`num whitespace-nowrap text-base ${accent ? "text-lime" : "text-ink"}`}>{value}</span>
        </div>
        {children}
      </div>
    </div></Portal>
  );
}
