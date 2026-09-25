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
import type { TxState } from "../useVault";
import { explorerTx } from "@/lib/vault/deployment";
import { units, usd, short } from "@/lib/format";

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

import { TOKEN_LOGOS } from "@/lib/token-logos";
const LOGOS = new Set(Object.keys(TOKEN_LOGOS));

/** Official xStock logo (public/tokens, from each mint's metadata), with a small p or d badge for the split tokens. */
export function TokenDot({ m, size = 36, badge }: { m: Pick<MarketSnapshot, "x" | "under" | "hue">; size?: number; badge?: "p" | "d" }) {
  const b = Math.max(12, Math.round(size * 0.42));
  return (
    <span className="relative inline-flex shrink-0" style={{ width: size, height: size }}>
      {LOGOS.has(m.x) ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={TOKEN_LOGOS[m.x]} alt={m.x} width={size} height={size} className="rounded-full border border-line-2" style={{ width: size, height: size }} />
      ) : (
        <span className="relative inline-flex h-full w-full items-center justify-center rounded-full border border-line-2 bg-surface-2 text-[10px] font-semibold text-ink">
          <span className="absolute inset-[3px] rounded-full opacity-35" style={{ background: m.hue }} />
          <span className="relative num">{m.under.slice(0, 4)}</span>
        </span>
      )}
      {badge && (
        <span
          className={`num absolute -bottom-0.5 -right-1 inline-flex items-center justify-center rounded-full border-2 border-bg font-semibold leading-none ${badge === "d" ? "bg-lime text-bg" : "bg-share text-bg"}`}
          style={{ width: b, height: b, fontSize: Math.max(8, Math.round(b * 0.6)) }}
        >
          {badge}
        </span>
      )}
    </span>
  );
}

export function TickerChips({ markets, value, onChange, page = false }: { markets: MarketSnapshot[]; value: string; onChange: (x: string) => void; page?: boolean }) {
  return (
    <div className={`no-scrollbar flex snap-x gap-1.5 overflow-x-auto pb-1 ${page ? "-mx-4 scroll-px-4 px-4" : "-mx-5 scroll-px-5 px-5"} [mask-image:linear-gradient(90deg,transparent,#000_16px,#000_calc(100%-28px),transparent)] sm:mx-0 sm:px-0 sm:[mask-image:none]`}>
      {markets.map((m) => (
        <button key={m.x} onClick={() => onChange(m.x)} aria-pressed={value === m.x} className={`relative flex h-11 shrink-0 snap-start items-center rounded-full border px-4 text-sm transition-colors sm:h-9 sm:px-3.5 ${value === m.x ? "border-lime text-bg" : "border-line-2 text-dim hover:border-line-2 hover:text-ink"}`}>
          {value === m.x && <motion.span layoutId="chip" className="absolute inset-0 rounded-full bg-lime" transition={{ type: "spring", stiffness: 500, damping: 36 }} />}
          <span className="relative inline-flex items-center gap-2">{LOGOS.has(m.x) && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={TOKEN_LOGOS[m.x]} alt="" width={18} height={18} className="rounded-full" style={{ width: 18, height: 18 }} />
          )}<span className="num">{m.x}</span></span>
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

/** Clear label for the devnet mock assets. */
export function TestNote({ children }: { children?: React.ReactNode }) {
  return (
    <div className="flex gap-3 rounded-xl border border-share/25 bg-share/[0.06] px-4 py-3 text-[13px] leading-relaxed text-share">
      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-share" />
      <span>{children ?? "Runs on Solana devnet with test tokens. Each test xStock is a Token-2022 mint whose ScaledUiAmount multiplier mirrors the real mainnet value. Nothing here trades on mainnet."}</span>
    </div>
  );
}

/** Shown when the wallet has no devnet SOL for fees. */
export function GasNote({ sol }: { sol: number | null }) {
  if (sol == null || sol >= 0.002) return null;
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-lime/30 bg-lime/[0.06] px-4 py-3 text-[13px] text-ink sm:flex-row sm:items-center sm:justify-between">
      <span>This wallet has {sol === 0 ? "no" : "almost no"} devnet SOL for network fees.</span>
      <a href="https://faucet.solana.com" target="_blank" rel="noreferrer" className="inline-flex h-11 shrink-0 items-center font-semibold text-lime hover:underline sm:h-auto">Get devnet SOL at faucet.solana.com ↗</a>
    </div>
  );
}

export function TxModal({ tx, onClose }: { tx: TxState; onClose: () => void }) {
  const r = tx.receipt;
  const open = tx.state !== "idle";
  return (
    <Portal><AnimatePresence>
      {open && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} className="fixed inset-0 z-[80] flex items-center justify-center bg-bg/70 p-4 backdrop-blur-[14px]" onClick={tx.state === "ok" || tx.state === "err" ? onClose : undefined}>
          <motion.div initial={{ y: 24, scale: 0.97, opacity: 0 }} animate={{ y: 0, scale: 1, opacity: 1 }} exit={{ y: 12, opacity: 0 }} transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }} onClick={(e) => e.stopPropagation()} className="no-scrollbar relative max-h-[calc(100svh-32px)] w-full max-w-md overflow-y-auto">
            {(tx.state === "signing" || tx.state === "confirming") && (
              <div className="rounded-[20px] border border-line-2 bg-surface p-7">
                <span className="micro text-lime">{tx.state === "signing" ? "Approve in your wallet" : "Confirming on devnet"}</span>
                <div className="display mt-4 text-3xl">{tx.label}</div>
                <div className="mt-6 flex items-center gap-3 text-sm text-dim"><span className="live-dot h-2 w-2 rounded-full bg-lime" />{tx.state === "signing" ? "Waiting for your signature…" : "Transaction sent. Waiting for confirmation…"}</div>
              </div>
            )}
            {tx.state === "err" && (
              <div className="rounded-[20px] border border-line-2 bg-surface p-7">
                <span className="micro text-dim">Transaction not sent</span>
                <div className="display mt-4 text-3xl">{tx.label}</div>
                <p className="mt-4 text-sm leading-relaxed text-ink">{tx.error}</p>
                <button onClick={onClose} className="btn btn-line mt-6 h-11 w-full">Close</button>
              </div>
            )}
            {tx.state === "ok" && r && (
              <>
                <div className="overflow-hidden rounded-t-[20px] border border-line-2 bg-surface p-7">
                  <div className="flex items-center justify-between">
                    <span className="micro text-lime">Confirmed on devnet</span>
                    <motion.span initial={{ scale: 0, rotate: -40 }} animate={{ scale: 1, rotate: 0 }} transition={{ delay: 0.15, type: "spring", stiffness: 400, damping: 14 }} className="flex h-9 w-9 items-center justify-center rounded-full bg-lime text-bg">✓</motion.span>
                  </div>
                  <div className="display mt-4 text-4xl">{r.title}</div>
                  <div className="mt-6 divide-y divide-line">
                    {r.lines.map(([k, v], i) => <Row key={k} k={k} v={v} accent={i === r.lines.length - 1} />)}
                    <Row k="Time" v={new Date(r.at).toLocaleString()} />
                  </div>
                </div>
                <div className="perf-h h-2 bg-surface" />
                <div className="rounded-b-[20px] border border-line-2 border-t-0 bg-surface px-7 pb-6 pt-4">
                  <div className="micro !text-[9px] text-faint">Transaction signature</div>
                  <a href={explorerTx(r.sig)} target="_blank" rel="noreferrer" className="num mt-1.5 flex min-h-11 items-center justify-between gap-3 text-sm text-lime hover:underline"><span>{short(r.sig, 10, 10)}</span><span>View on Explorer ↗</span></a>
                  <button onClick={onClose} className="btn btn-lime mt-4 h-11 w-full">Done</button>
                </div>
              </>
            )}
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
