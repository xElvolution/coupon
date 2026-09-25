"use client";
import { AnimatePresence, motion } from "framer-motion";
import type { MarketSnapshot } from "@/lib/types";
import type { Receipt } from "../useLedger";
import { units, usd } from "@/lib/format";

export function PageHead({ kicker, title, accent, sub, right }: { kicker: string; title: string; accent?: string; sub?: string; right?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-6">
      <div>
        <div className="micro text-lime">{kicker}</div>
        <h1 className="display mt-3 text-[clamp(2.2rem,5vw,3.6rem)] leading-[0.98]">{title} {accent && <em className="text-lime">{accent}</em>}</h1>
        {sub && <p className="mt-3 max-w-xl text-dim">{sub}</p>}
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

export function TickerChips({ markets, value, onChange }: { markets: MarketSnapshot[]; value: string; onChange: (x: string) => void }) {
  return (
    <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
      {markets.map((m) => (
        <button key={m.x} onClick={() => onChange(m.x)} className={`relative shrink-0 rounded-full border px-3.5 py-1.5 text-sm transition-colors ${value === m.x ? "border-lime text-bg" : "border-line-2 text-dim hover:border-line-2 hover:text-ink"}`}>
          {value === m.x && <motion.span layoutId="chip" className="absolute inset-0 rounded-full bg-lime" transition={{ type: "spring", stiffness: 500, damping: 36 }} />}
          <span className="relative num">{m.x}</span>
        </button>
      ))}
    </div>
  );
}

export function Seg<T extends string>({ options, value, onChange }: { options: [T, string][]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="inline-flex rounded-full border border-line-2 bg-bg p-1">
      {options.map(([k, l]) => (
        <button key={k} onClick={() => onChange(k)} className={`relative rounded-full px-4 py-1.5 text-sm transition-colors ${value === k ? "text-bg" : "text-dim hover:text-ink"}`}>
          {value === k && <motion.span layoutId={`seg-${options.map((o) => o[0]).join("")}`} className="absolute inset-0 rounded-full bg-ink" transition={{ type: "spring", stiffness: 500, damping: 36 }} />}
          <span className="relative">{l}</span>
        </button>
      ))}
    </div>
  );
}

export function AmountField({ label, value, onChange, max, suffix }: { label: string; value: string; onChange: (v: string) => void; max: number; suffix: string }) {
  return (
    <div className="rounded-2xl border border-line-2 bg-bg p-4 transition-colors focus-within:border-lime/60">
      <div className="flex items-center justify-between">
        <span className="micro !text-[9px] text-dim">{label}</span>
        <button onClick={() => onChange(String(Math.floor(max * 1e4) / 1e4))} className="num text-[11px] text-dim hover:text-lime">Available {units(max, 4)} · <span className="text-lime">Max</span></button>
      </div>
      <div className="mt-2 flex items-center gap-3">
        <input inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value.replace(/[^0-9.]/g, ""))} placeholder="0.00" className="num w-full bg-transparent text-4xl text-ink outline-none placeholder:text-faint" />
        <span className="num shrink-0 rounded-full border border-line-2 px-3 py-1 text-sm text-ink">{suffix}</span>
      </div>
    </div>
  );
}

export function Row({ k, v, accent }: { k: string; v: React.ReactNode; accent?: boolean }) {
  return (
    <div className="flex items-center justify-between py-2.5 text-sm">
      <span className="text-dim">{k}</span>
      <span className={`num ${accent ? "text-lime" : "text-ink"}`}>{v}</span>
    </div>
  );
}

export function PaperNote() {
  return (
    <div className="flex gap-3 rounded-xl border border-share/25 bg-share/[0.06] px-4 py-3 text-[13px] text-share">
      <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-share" />
      <span>Paper ledger. Prices and multipliers are live, but vault balances are recorded in this browser only. No tokens move and nothing is sent onchain.</span>
    </div>
  );
}

const TITLES: Record<Receipt["action"], string> = { split: "Split recorded", redeem: "Redeem recorded", sell: "Coupon sold", buy: "Coupon bought" };

export function ReceiptModal({ r, onClose }: { r: Receipt | null; onClose: () => void }) {
  return (
    <AnimatePresence>
      {r && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} className="fixed inset-0 z-[80] flex items-center justify-center bg-bg/70 p-4 backdrop-blur-[14px]" onClick={onClose}>
          <motion.div initial={{ y: 24, scale: 0.97, opacity: 0 }} animate={{ y: 0, scale: 1, opacity: 1 }} exit={{ y: 12, opacity: 0 }} transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }} onClick={(e) => e.stopPropagation()} className="relative w-full max-w-md">
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
              <div className="micro !text-[9px] text-faint">Receipt id · paper ledger, not a Solana signature</div>
              <div className="num mt-1 break-all text-xs text-dim">{r.id}</div>
              <button onClick={onClose} className="btn btn-lime mt-5 h-11 w-full">Done</button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
