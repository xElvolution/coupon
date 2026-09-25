"use client";
import Sk from "@/components/Sk";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { useMarkets } from "@/components/useMarkets";
import { useVault, posOf } from "@/components/useVault";
import { ActionButton } from "@/components/app/ActionButton";
import { AmountField, GasNote, PageHead, Row, Seg, StickyAction, TestNote, TickerChips, TxModal } from "@/components/app/ui";
import { Rosette } from "@/components/Guilloche";
import { units, pct } from "@/lib/format";
import { X_DECIMALS, fromRaw, shareValue, toRaw } from "@/lib/vault/sdk";

function SplitInner() {
  const sp = useSearchParams();
  const { data, get } = useMarkets();
  const v = useVault();
  const [x, setX] = useState(sp.get("x") ?? "SPYx");
  const [mode, setMode] = useState<"split" | "redeem">("split");
  const [amt, setAmt] = useState(sp.get("amt") ?? "");
  const m = get(x);
  const cm = v.markets[x];
  const pos = posOf(v, x);
  const listed = (data?.markets ?? []).filter((k) => v.markets[k.x]?.exists || !v.loaded);
  const n = Number(amt) || 0;
  const raw = toRaw(n, X_DECIMALS);
  const mult = cm?.multiplier ?? null;
  const mBase = cm?.mBase ?? null;
  const xBal = fromRaw(pos.x, X_DECIMALS);
  const pairBal = fromRaw(pos.p < pos.d ? pos.p : pos.d, X_DECIMALS);
  const max = mode === "split" ? xBal : pairBal;
  const minted = mult && mBase ? fromRaw(shareValue(raw, mult, mBase), X_DECIMALS) : n;
  const back = mult && mBase ? fromRaw(shareValue(raw, mBase, mult), X_DECIMALS) : n;
  const claimable = fromRaw(pos.claimable, X_DECIMALS);
  const bad = n <= 0 || (!!v.owner && n > max + 1e-9);

  const go = async () => {
    if (!v.vault || !v.owner || bad || !cm) return;
    const dep = cm.dep;
    if (mode === "split") {
      const ok = await v.run(`Split ${units(n, 2)} ${x}`, v.vault.split(v.owner, dep, raw), (sig) => ({
        action: "split", symbol: x, sig, at: Date.now(), title: "Split confirmed",
        lines: [["Deposited", `${units(n, 4)} ${x}`], ["Multiplier recorded", mult?.toFixed(9) ?? "not read"], ["Received", `${units(minted, 4)} p${x} + ${units(minted, 4)} d${x}`]],
      }));
      if (ok) setAmt("");
    } else {
      const ok = await v.run(`Recombine ${units(n, 2)} p${x} + d${x}`, v.vault.recombine(v.owner, dep, raw), (sig) => ({
        action: "recombine", symbol: x, sig, at: Date.now(), title: "Recombined",
        lines: [["Burned", `${units(n, 4)} p${x} + ${units(n, 4)} d${x}`], ["Received", `${units(back, 6)} ${x}`]],
      }));
      if (ok) setAmt("");
    }
  };
  const claim = async () => {
    if (!v.vault || !v.owner || !cm) return;
    await v.run(`Claim d${x} income`, (pos.dAccounts.filter((a) => a.claimable > 0n).length ? pos.dAccounts.filter((a) => a.claimable > 0n) : [{ key: v.vault.ata(v.vault.keys(cm.dep).d, v.owner) }]).flatMap((a, i) => { const ix = v.vault!.claim(v.owner!, cm.dep, a.key); return i === 0 ? [v.vault!.ensureAta(v.owner!, v.vault!.keys(cm.dep).x, v.owner!), ...ix] : ix; }), (sig) => ({
      action: "claim", symbol: x, sig, at: Date.now(), title: "Income claimed",
      lines: [["Coupon", `${units(fromRaw(pos.d, X_DECIMALS), 4)} d${x}`], ["Multiplier now", mult?.toFixed(9) ?? "not read"], ["Received", `${units(claimable, 8)} ${x}`]],
    }));
  };

  const cta = n <= 0 ? "Enter an amount" : v.owner && n > max + 1e-9 ? (mode === "split" && xBal === 0 ? `Get test ${x} from the faucet` : "Not enough balance") : mode === "split" ? `Split ${units(n, 2)} ${x}` : `Recombine into ${x}`;
  const btn = (cls = "") => <ActionButton className={cls} label={cta} connectLabel="Connect a devnet wallet to split" disabled={bad} onClick={go} />;
  return (
    <div className="pb-40 md:pb-0">
      <PageHead kicker="Split" title="Tear off" accent="the coupon." sub="Deposit a test xStock into the vault program. Get a share token that keeps the base value and a dividend token that collects every multiplier bump for 12 months." />
      <div className="mt-6 grid grid-cols-1 gap-4 sm:mt-8 lg:grid-cols-[1.05fr_1fr] lg:gap-5">
        <div className="card min-w-0 p-5 sm:p-7">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Seg options={[["split", "Split"], ["redeem", "Recombine"]]} value={mode} onChange={setMode} />
            <span className="micro hidden !text-[9px] text-share sm:inline">Devnet · onchain</span>
          </div>
          <div className="mt-5"><TickerChips markets={listed} value={x} onChange={setX} /></div>
          <div className="mt-5">
            <AmountField label={mode === "split" ? `Deposit test ${x}` : `Return p${x} + d${x}`} value={amt} onChange={setAmt} max={max} suffix={mode === "split" ? x : `p+d`} />
          </div>
          <div className="my-4 flex justify-center">
            <motion.div animate={{ rotate: mode === "split" ? 0 : 180 }} className="flex h-10 w-10 items-center justify-center rounded-full border border-line-2 bg-surface-2 text-lime">↓</motion.div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {mode === "split" ? (
              <>
                <div className="min-w-0 rounded-2xl border border-line-2 bg-surface-2 p-4"><div className="micro !text-[9px] text-share">Share token</div><div className="num mt-2 truncate text-2xl">{units(minted, 4)}</div><div className="num mt-1 text-sm text-dim">p{x}</div></div>
                <div className="min-w-0 rounded-2xl border border-lime/35 bg-lime/[0.06] p-4"><div className="micro !text-[9px] text-lime">Dividend token</div><div className="num mt-2 truncate text-2xl text-lime">{units(minted, 4)}</div><div className="num mt-1 text-sm text-dim">d{x}</div></div>
              </>
            ) : (
              <div className="col-span-2 rounded-2xl border border-line-2 bg-surface-2 p-4"><div className="micro !text-[9px] text-dim">You receive</div><div className="num mt-2 text-2xl">{units(back, 6)} {x}</div></div>
            )}
          </div>
          <div className="mt-5 divide-y divide-line border-t border-line">
            <Row k="Test mint multiplier (mirrors mainnet)" v={mult?.toFixed(9) ?? <Sk />} />
            <Row k="Vault base multiplier" v={mBase?.toFixed(9) ?? <Sk />} />
            <Row k="Projected 12m dividend units" v={m ? `${units(n * m.trailingYield, 6)} ${x}` : <Sk />} accent />
          </div>
          <div className="mt-6 hidden md:block">{btn()}</div>
          <div className="mt-4 space-y-3"><GasNote sol={v.sol} /><TestNote /></div>
        </div>

        <div className="flex min-w-0 flex-col gap-4 lg:gap-5">
          <div className="card relative min-w-0 overflow-hidden p-5 sm:p-7">
            <Rosette size={420} spin className="pointer-events-none absolute -right-28 -top-28 text-lime" opacity={0.07} />
            <div className="flex items-center justify-between gap-3">
              <div className="micro !text-[9px] text-dim">Your {x} on devnet</div>
              <Link href="/app/faucet" className="-my-3 inline-flex h-11 items-center text-xs text-lime hover:underline">Faucet →</Link>
            </div>
            <div className="mt-5 grid grid-cols-3 gap-2 sm:gap-3">
              {[[x, pos.x, "text-ink"], [`p${x}`, pos.p, "text-share"], [`d${x}`, pos.d, "text-lime"]].map(([k, val, c]) => (
                <div key={k as string} className="min-w-0 rounded-2xl border border-line bg-bg/60 p-3 sm:p-4">
                  <div className="num truncate text-xs text-dim">{k as string}</div>
                  <motion.div key={String(val)} initial={{ y: 8, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className={`num mt-2 truncate text-xl ${c}`}>{v.owner ? units(fromRaw(val as bigint, X_DECIMALS), 2) : <Sk />}</motion.div>
                </div>
              ))}
            </div>
            <div className="mt-5 flex flex-col gap-3 rounded-2xl border border-lime/25 bg-lime/[0.05] p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="micro !text-[9px] text-lime">Claimable coupon income</div>
                <div className="num mt-1.5 text-xl text-ink">{v.owner ? `${units(claimable, 8)} ${x}` : <Sk />}</div>
                <div className="mt-1 text-xs text-dim">{pos.snap ? `Since multiplier ${pos.snap.toFixed(9)}` : "Snapshot starts at your first split"}</div>
              </div>
              <button onClick={claim} disabled={!v.owner || pos.claimable === 0n || v.tx.state === "signing" || v.tx.state === "confirming"} className="btn btn-line h-11 shrink-0 px-5 text-sm">Claim</button>
            </div>
          </div>
          <div className="card min-w-0 p-5 sm:p-7">
            <div className="micro !text-[9px] text-dim">How d{x} gets paid</div>
            <div className="display mt-3 text-xl sm:text-2xl">Extra units = base units × (new − old multiplier)</div>
            <p className="mt-3 text-sm leading-relaxed text-dim">When Backed applies a dividend on mainnet, the {x} multiplier steps up. The vault program reads the test mint&apos;s multiplier onchain and releases the added units to d{x} holders. {m && m.bumps.length > 0 && <>The last real {x} bump took the multiplier from <span className="num text-ink">{m.bumps[m.bumps.length - 1].prev.toFixed(6)}</span> to <span className="num text-ink">{m.bumps[m.bumps.length - 1].next.toFixed(6)}</span>.</>}</p>
            <div className="mt-5 flex items-center justify-between rounded-xl border border-line bg-bg/60 px-4 py-3 text-sm"><span className="text-dim">Trailing 12m, mainnet</span><span className="num text-lime">{pct(m?.trailingYield, 3)}</span></div>
          </div>
        </div>
      </div>
      <StickyAction label={mode === "split" ? "You get" : "You receive"} value={mode === "split" ? `${units(minted, 2)} p + d` : `${units(back, 2)} ${x}`} accent>
        {btn()}
      </StickyAction>
      <TxModal tx={v.tx} onClose={v.closeTx} />
    </div>
  );
}

export default function SplitPage() {
  return <Suspense><SplitInner /></Suspense>;
}
