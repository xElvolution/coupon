"use client";
import Sk from "@/components/Sk";
import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { useMarkets } from "@/components/useMarkets";
import { PageHead, TickerChips } from "@/components/app/ui";
import RollingNumber from "@/components/RollingNumber";
import { Rosette } from "@/components/Guilloche";
import { units, usd, dateUTC, short, pct } from "@/lib/format";
import type { Bump } from "@/lib/types";
import { getJSON } from "@/lib/api";

interface ChainRead {
  ok: boolean;
  error?: string;
  network: string;
  rpc: string;
  mint: string;
  program: string;
  symbol: string;
  name: string;
  decimals: number;
  supplyBaseUnits: string;
  scaledUiAmountConfig: { authority: string; multiplier: number; newMultiplier: number; newMultiplierEffectiveTimestamp: number };
  effectiveMultiplier: number;
  lastBump: Bump | null;
  history: Bump[];
  readAt: number;
}

function ReplayInner() {
  const sp = useSearchParams();
  const { data, get } = useMarkets();
  const [x, setX] = useState(sp.get("x") ?? "SPYx");
  const [holding, setHolding] = useState(100);
  const [c, setC] = useState<ChainRead | null>(null);
  const [busy, setBusy] = useState(false);
  const [sel, setSel] = useState<number | null>(null);
  const m = get(x);
  const paying = (data?.markets ?? []).filter((k) => k.bumps.length > 0);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      setC(await getJSON<ChainRead>(`/api/chain?x=${x}`));
    } catch {
      setC(null);
    } finally {
      setBusy(false);
    }
  }, [x]);
  useEffect(() => { setC(null); setSel(null); load(); const t = setInterval(load, 20000); return () => clearInterval(t); }, [load]);

  const hist = c?.ok ? c.history : (m?.bumps ?? []); // server rendered history until the chain read lands
  const idx = sel ?? hist.length - 1;
  const b = hist[idx];
  const extra = b ? holding * (b.next / b.prev - 1) : null;
  const cfg = c?.ok ? c.scaledUiAmountConfig : null;
  const fieldsMatch = b && cfg ? Math.abs(cfg.newMultiplier - b.next) < 1e-12 && Math.abs(cfg.multiplier - b.prev) < 1e-12 : false;
  const cum = hist.reduce((s, k) => s + holding * (k.next / k.prev - 1) * (k.prev / (hist[0]?.prev ?? 1)), 0);

  return (
    <div>
      <PageHead kicker="Replay · chain proof" title="What a coupon" accent="would have paid." sub="Pick a real dividend bump. We recompute exactly what a holder received, straight from the multiplier values, and show the live mint account we read it from." right={<button onClick={load} className="btn btn-line h-11 px-4 text-xs md:h-9">{busy ? "Reading chain" : "Re-read chain"}</button>} />
      <div className="mt-6"><TickerChips page markets={paying} value={x} onChange={setX} /></div>

      <div className="mt-6 grid gap-5 lg:grid-cols-[1.25fr_1fr]">
        <div className="card relative overflow-hidden p-7 sm:p-9">
          <Rosette size={520} spin className="pointer-events-none absolute -right-40 -top-40 text-lime" opacity={0.07} rings={5} />
          <div className="relative">
            <div className="micro !text-[9px] text-dim">{b ? `Dividend bump · ${dateUTC(b.at)} · ${new Date(b.at).toISOString().slice(11, 16)} UTC` : "Reading history"}</div>
            <p className="display mt-5 text-[clamp(1.6rem,3.2vw,2.5rem)] leading-[1.15]">
              At this bump, a holder of{" "}
              <label className="relative inline-flex cursor-text items-baseline rounded-lg border border-line-2 bg-bg px-2 before:absolute before:-inset-x-1 before:-inset-y-2 before:content-['']">
                <input aria-label="Units held" inputMode="decimal" value={holding} onChange={(e) => setHolding(Math.max(0, Math.min(1e7, Number(e.target.value.replace(/[^0-9.]/g, "")) || 0)))} className="num h-[1.4em] w-[4.2ch] bg-transparent text-center text-lime outline-none" />
              </label>{" "}
              {x} received <span className="text-lime"><RollingNumber value={extra != null ? units(extra, 8) : "0.00000000"} /></span> {x}.
            </p>
            <p className="mt-4 text-lg text-dim">A d{x} holder would have received exactly that, worth <span className="num text-ink">{usd(extra != null && m?.xPrice ? extra * m.xPrice : null)}</span> at today&apos;s live price.</p>
            <div className="mt-8 grid grid-cols-3 gap-px overflow-hidden rounded-2xl border border-line bg-line">
              <div className="bg-surface p-4"><div className="micro !text-[9px] text-dim">Previous</div><div className="num mt-2 text-sm text-ink sm:text-base">{b?.prev.toFixed(12) ?? <Sk />}</div></div>
              <div className="bg-surface p-4"><div className="micro !text-[9px] text-dim">New</div><div className="num mt-2 text-sm text-ink sm:text-base">{b?.next.toFixed(12) ?? <Sk />}</div></div>
              <div className="bg-surface p-4"><div className="micro !text-[9px] text-lime">Step</div><div className="num mt-2 text-sm text-lime sm:text-base">{b ? pct(b.next / b.prev - 1, 4) : <Sk />}</div></div>
            </div>
            <div className="num mt-4 text-xs text-faint">extra = {holding} × ({b?.next.toFixed(6) ?? "new"} ÷ {b?.prev.toFixed(6) ?? "previous"} − 1) = {extra != null ? extra.toFixed(8) : <Sk />}</div>
            {b && idx === hist.length - 1 && (
              <div className={`mt-5 inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs ${fieldsMatch ? "border-lime/40 bg-lime/10 text-lime" : "border-line-2 text-dim"}`}>
                <span className="h-1.5 w-1.5 rounded-full bg-current" />
                {fieldsMatch ? "Matches multiplier and newMultiplier on the live mint account" : "Latest bump predates the fields now on the mint"}
              </div>
            )}
          </div>
        </div>

        <div className="card p-6 sm:p-7">
          <div className="flex items-center justify-between">
            <div className="display text-2xl">Every {x} bump</div>
            <span className="micro !text-[9px] text-faint">{hist.length} total</span>
          </div>
          <div className="mt-5 space-y-2">
            {hist.map((k, i) => {
              const on = i === idx;
              return (
                <motion.button key={k.at} onClick={() => setSel(i)} initial={{ x: 10 }} animate={{ x: 0 }} transition={{ delay: i * 0.05 }} className={`flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left text-sm transition-colors ${on ? "border-lime/50 bg-lime/[0.07]" : "border-line hover:border-line-2"}`}>
                  <span className="num text-dim">{dateUTC(k.at)}</span>
                  <span className="num text-ink">+{units(holding * (k.next / k.prev - 1), 6)}</span>
                  <span className={`micro !text-[9px] ${on ? "text-lime" : "text-faint"}`}>{k.reason}</span>
                </motion.button>
              );
            })}
            {!hist.length && Array.from({ length: 4 }, (_, i) => <div key={i} className="h-11 animate-pulse rounded-xl bg-surface-2" />)}
          </div>
          <div className="mt-5 flex items-center justify-between border-t border-line pt-4 text-sm">
            <span className="text-dim">All bumps, {holding} units at launch</span>
            <span className="num text-lime">+{units(cum, 6)}</span>
          </div>
        </div>
      </div>

      <div className="card mt-5 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-6 py-4">
          <div>
            <div className="display text-2xl">Live mint account</div>
            <div className="text-sm text-dim">Token-2022 scaledUiAmountConfig, read from Solana mainnet{c?.ok ? ` at ${new Date(c.readAt).toLocaleTimeString()}` : ""}.</div>
          </div>
          {c?.ok && (
            <div className="flex gap-2">
              <a href={`https://solscan.io/token/${c.mint}`} target="_blank" rel="noreferrer" className="btn btn-line h-11 px-4 text-xs md:h-9">Solscan ↗</a>
              <a href={`https://explorer.solana.com/address/${c.mint}`} target="_blank" rel="noreferrer" className="btn btn-line h-11 px-4 text-xs md:h-9">Explorer ↗</a>
            </div>
          )}
        </div>
        {c && !c.ok && <div className="px-6 py-6 text-sm text-dim">Chain read failed: {c.error}</div>}
        {c?.ok && cfg && (
          <div className="grid gap-px bg-line md:grid-cols-2">
            <div className="bg-surface p-6">
              {[
                ["Mint", c.mint],
                ["Token", `${c.name} (${c.symbol})`],
                ["Program", c.program],
                ["Decimals", String(c.decimals)],
                ["Supply, base units", (Number(c.supplyBaseUnits) / 10 ** c.decimals).toLocaleString("en-US", { maximumFractionDigits: 4 })],
                ["Multiplier authority", cfg.authority],
              ].map(([k, v]) => (
                <div key={k} className="flex items-start justify-between gap-4 border-b border-line py-2.5 text-sm last:border-0">
                  <span className="shrink-0 text-dim">{k}</span>
                  <span className="num break-all text-right text-ink"><span className="hidden sm:inline">{v}</span><span className="sm:hidden">{v.length > 20 ? short(v, 6, 6) : v}</span></span>
                </div>
              ))}
            </div>
            <div className="bg-bg p-6">
              <div className="micro !text-[9px] text-faint">extensions.scaledUiAmountConfig</div>
              <pre className="num mt-3 overflow-x-auto text-[13px] leading-relaxed text-dim">
{`{
  "authority": "${short(cfg.authority, 6, 6)}",
  "multiplier": `}<span className="text-ink">{String(cfg.multiplier)}</span>{`,
  "newMultiplier": `}<span className="text-lime">{String(cfg.newMultiplier)}</span>{`,
  "newMultiplierEffectiveTimestamp": `}<span className="text-ink">{cfg.newMultiplierEffectiveTimestamp}</span>{`
}`}
              </pre>
              <div className="mt-4 space-y-1.5 text-sm">
                <div className="flex justify-between"><span className="text-dim">Effective at</span><span className="num">{new Date(cfg.newMultiplierEffectiveTimestamp * 1000).toISOString().replace("T", " ").slice(0, 16)} UTC</span></div>
                <div className="flex justify-between"><span className="text-dim">Effective now</span><span className="num text-lime">{c.effectiveMultiplier.toFixed(12)}</span></div>
                <div className="flex justify-between"><span className="text-dim">RPC</span><span className="num text-faint">{c.rpc.replace("https://", "")}</span></div>
              </div>
            </div>
          </div>
        )}
        {!c && <div className="h-40 animate-pulse bg-surface" />}
        <div className="border-t border-line px-6 py-3 text-xs text-faint">History from api.xstocks.fi public multiplier history. The most recent entry is cross checked against the mint account fields above.</div>
      </div>
    </div>
  );
}

export default function ReplayPage() {
  return <Suspense><ReplayInner /></Suspense>;
}
