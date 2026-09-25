"use client";
import Sk from "@/components/Sk";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { PublicKey } from "@solana/web3.js";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { useMarkets } from "@/components/useMarkets";
import { useVault } from "@/components/useVault";
import { GasNote, PageHead, TestNote, TokenDot, TxModal } from "@/components/app/ui";
import { units, short } from "@/lib/format";
import { FAUCET_COOLDOWN, FAUCET_USDC, FAUCET_X, USDC_DECIMALS, X_DECIMALS, fromRaw } from "@/lib/vault/sdk";
import { explorerAddr } from "@/lib/vault/deployment";

const left = (last: number | null | undefined, now: number) => (last ? Math.max(0, last + FAUCET_COOLDOWN - now) : 0);
const mmss = (s: number) => `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;

export default function FaucetPage() {
  const v = useVault();
  const { get } = useMarkets();
  const { setVisible } = useWalletModal();
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => { const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000); return () => clearInterval(t); }, []);
  const busy = v.tx.state === "signing" || v.tx.state === "confirming";

  const claim = async (symbol: string) => {
    if (!v.vault || !v.owner) return;
    if (symbol === "USDC") {
      await v.run("Claim 1,000 test USDC", v.vault.faucet(v.owner, v.vault.usdc), (sig) => ({ action: "faucet", symbol, sig, at: Date.now(), title: "Faucet paid", lines: [["Token", "Test USDC · devnet"], ["Received", `${units(FAUCET_USDC, 2)} USDC`]] }));
      return;
    }
    const cm = v.markets[symbol];
    if (!cm) return;
    const k = v.vault.keys(cm.dep);
    await v.run(`Claim ${FAUCET_X} test ${symbol}`, v.vault.faucet(v.owner, k.x), (sig) => ({ action: "faucet", symbol, sig, at: Date.now(), title: "Faucet paid", lines: [["Token", `Test ${symbol} · devnet`], ["Multiplier (mirrors mainnet)", cm.multiplier?.toFixed(9) ?? "not read"], ["Received", `${units(FAUCET_X, 2)} ${symbol}`]] }));
  };

  const tokens = [
    { symbol: "USDC", name: "Test USDC", mint: v.vault?.usdc.toBase58(), bal: fromRaw(v.usdc, USDC_DECIMALS), amount: FAUCET_USDC, mult: null as number | null },
    ...(v.vault?.dep.markets ?? []).map((d) => ({ symbol: d.symbol, name: get(d.symbol)?.name ?? d.symbol, mint: d.xMint, bal: fromRaw(v.positions[d.symbol]?.x ?? 0n, X_DECIMALS), amount: FAUCET_X, mult: v.markets[d.symbol]?.multiplier ?? d.multiplier })),
  ];

  return (
    <div>
      <PageHead kicker="Faucet" title="Test tokens," accent="free on devnet." sub="Claim test xStocks and test USDC to try every flow. Each test xStock is a Token-2022 mint whose ScaledUiAmount multiplier was set to the real mainnet value at deploy. A test mint moves above mainnet only when the admin replays a real bump size so claims can be shown. One claim per token per hour." />
      <div className="mt-6 space-y-3 sm:mt-8">
        {!v.owner ? (
          <div className="card flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
            <div><div className="display text-2xl">Connect a devnet wallet</div><p className="mt-1 text-sm text-dim">Phantom or Solflare with devnet enabled (Phantom: Settings, Developer settings, Testnet mode).</p></div>
            <button onClick={() => setVisible(true)} className="btn btn-lime h-11 shrink-0 px-5 text-sm">Connect wallet</button>
          </div>
        ) : (
          <div className="card flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
            <div className="min-w-0">
              <div className="micro !text-[9px] text-dim">Connected · devnet</div>
              <a href={explorerAddr(v.owner.toBase58())} target="_blank" rel="noreferrer" className="num mt-1 inline-flex min-h-11 items-center text-ink hover:text-lime">{short(v.owner.toBase58(), 6, 6)} ↗</a>
            </div>
            <div className="flex items-baseline gap-2"><span className="micro !text-[9px] text-dim">Gas</span><span className="num text-xl">{v.sol != null ? units(v.sol, 4) : <Sk />}</span><span className="text-sm text-dim">SOL</span></div>
          </div>
        )}
        <GasNote sol={v.sol} />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {tokens.map((t, i) => {
          const last = v.drips[t.symbol];
          const wait = left(last, now);
          const m = get(t.symbol);
          const noMarket = t.symbol !== "USDC" && !v.markets[t.symbol]?.exists;
          return (
            <motion.div key={t.symbol} initial={{ y: 12 }} animate={{ y: 0 }} transition={{ delay: i * 0.03 }} className={`card flex min-w-0 flex-col p-5 ${t.symbol === "USDC" ? "sm:col-span-2 lg:col-span-1" : ""}`}>
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  {m ? <TokenDot m={m} size={40} /> : <span className="num flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-lime/40 bg-lime/10 text-[10px] text-lime">USDC</span>}
                  <div className="min-w-0"><div className="num text-ink">{t.symbol}</div><div className="truncate text-xs text-dim">{t.name} · devnet test</div></div>
                </div>
                <div className="text-right"><div className="micro !text-[8px] text-faint">Balance</div><div className="num text-lg">{v.owner ? units(t.bal, 2) : <Sk />}</div></div>
              </div>
              <div className="mt-4 space-y-1.5 text-xs">
                <div className="flex justify-between gap-3"><span className="text-dim">Per claim</span><span className="num">{units(t.amount, 0)} {t.symbol}</span></div>
                {t.mult != null && <div className="flex justify-between gap-3"><span className="text-dim">Test mint multiplier</span><span className="num text-lime">{t.mult.toFixed(9)}</span></div>}
                {m?.multiplier != null && <div className="flex justify-between gap-3"><span className="text-dim">Mainnet multiplier</span><span className="num">{m.multiplier.toFixed(9)}</span></div>}
                {t.mint && <div className="flex justify-between gap-3"><span className="text-dim">Mint</span><a href={explorerAddr(t.mint)} target="_blank" rel="noreferrer" className="num text-dim hover:text-lime">{short(t.mint, 4, 4)} ↗</a></div>}
              </div>
              <div className="mt-auto pt-4">
                {!v.owner ? (
                  <button onClick={() => setVisible(true)} className="btn btn-line h-11 w-full text-sm">Connect to claim</button>
                ) : (
                  <button disabled={busy || wait > 0 || noMarket || !v.deployed} onClick={() => claim(t.symbol)} className="btn btn-lime h-11 w-full text-sm">
                    {wait > 0 ? `Next claim in ${mmss(wait)}` : `Claim ${units(t.amount, 0)} ${t.symbol}`}
                  </button>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>
      <div className="mt-4"><TestNote /></div>
      <TxModal tx={v.tx} onClose={v.closeTx} />
    </div>
  );
}
