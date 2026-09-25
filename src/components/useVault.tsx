"use client";
import { Buffer } from "buffer";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey, Transaction, type TransactionInstruction } from "@solana/web3.js";
import { CouponVault, X_DECIMALS, USDC_DECIMALS, couponClaim, explainError, fromRaw, readScaledMultiplier, type MarketDeployment } from "@/lib/vault/sdk";
import { DEPLOYMENT } from "@/lib/vault/deployment";

export type ChainMarket = {
  symbol: string;
  dep: MarketDeployment;
  exists: boolean;
  multiplier: number | null;
  mBase: number | null;
  maturity: number | null;
  reserveD: bigint;
  reserveUsdc: bigint;
  lpSupply: bigint;
  hasPool: boolean;
  /** pool mid price in USDC per coupon */
  poolPrice: number | null;
};
export type ChainPosition = { x: bigint; p: bigint; d: bigint; lp: bigint; snap: number | null; claimable: bigint };
export type TxAction = "faucet" | "split" | "recombine" | "claim" | "sell" | "buy" | "redeem";
export type TxReceipt = { action: TxAction; symbol: string; title: string; lines: [string, string][]; sig: string; at: number };
export type TxState = { state: "idle" | "signing" | "confirming" | "ok" | "err"; label?: string; error?: string; receipt?: TxReceipt };

interface Ctx {
  vault: CouponVault | null;
  deployed: boolean;
  owner: PublicKey | null;
  sol: number | null;
  usdc: bigint;
  markets: Record<string, ChainMarket>;
  positions: Record<string, ChainPosition>;
  drips: Record<string, number | null>;
  loaded: boolean;
  refresh: () => Promise<void>;
  tx: TxState;
  run: (label: string, ixs: TransactionInstruction[], mk: (sig: string) => TxReceipt) => Promise<string | null>;
  closeTx: () => void;
  history: TxReceipt[];
}
const VaultCtx = createContext<Ctx | null>(null);

const EMPTY: ChainPosition = { x: 0n, p: 0n, d: 0n, lp: 0n, snap: null, claimable: 0n };
const u64At = (b: Uint8Array | undefined, o: number) => (b && b.length >= o + 8 ? Buffer.from(b).readBigUInt64LE(o) : 0n);

export function VaultProvider({ children }: { children: React.ReactNode }) {
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();
  const vault = useMemo(() => (DEPLOYMENT ? new CouponVault(DEPLOYMENT) : null), []);
  const [markets, setMarkets] = useState<Record<string, ChainMarket>>({});
  const [positions, setPositions] = useState<Record<string, ChainPosition>>({});
  const [drips, setDrips] = useState<Record<string, number | null>>({});
  const [sol, setSol] = useState<number | null>(null);
  const [usdc, setUsdc] = useState<bigint>(0n);
  const [loaded, setLoaded] = useState(false);
  const [tx, setTx] = useState<TxState>({ state: "idle" });
  const [history, setHistory] = useState<TxReceipt[]>([]);
  const busy = useRef(false);
  const again = useRef(false);
  const histKey = publicKey && vault ? `coupon.tx.v2.${vault.programId.toBase58().slice(0, 8)}.${publicKey.toBase58()}` : null;

  useEffect(() => {
    if (!histKey) return setHistory([]);
    try { setHistory(JSON.parse(localStorage.getItem(histKey) || "[]")); } catch { setHistory([]); }
  }, [histKey]);

  const refresh = useCallback(async () => {
    if (!vault) return;
    if (busy.current) { again.current = true; return; }
    busy.current = true;
    try {
      const deps = vault.dep.markets;
      // market level reads: market PDA, x mint, pool reserves, lp mint
      const mkKeys = deps.flatMap((m) => {
        const k = vault.keys(m);
        return [k.market, k.x, vault.ata(k.d, k.pool), vault.ata(vault.usdc, k.pool), k.lp ?? k.d];
      });
      const owner = publicKey;
      const posKeys = owner
        ? deps.flatMap((m) => {
            const k = vault.keys(m);
            return [vault.ata(k.x, owner), vault.ata(k.p, owner), vault.ata(k.d, owner), k.lp ? vault.ata(k.lp, owner) : vault.ata(k.d, owner), vault.pos(k.market, owner), vault.drip(k.x, owner)];
          }).concat([vault.ata(vault.usdc, owner), vault.drip(vault.usdc, owner)])
        : [];
      const all = [...mkKeys, ...posKeys];
      const infos: (Uint8Array | undefined)[] = [];
      for (let i = 0; i < all.length; i += 100) {
        const r = await connection.getMultipleAccountsInfo(all.slice(i, i + 100), "confirmed");
        infos.push(...r.map((a) => (a ? new Uint8Array(a.data) : undefined)));
      }
      const nm: Record<string, ChainMarket> = {};
      deps.forEach((m, i) => {
        const [mk, xm, pd, pu, lp] = infos.slice(i * 5, i * 5 + 5);
        const rd = u64At(pd, 64), ru = u64At(pu, 64);
        const b = mk ? Buffer.from(mk) : null;
        nm[m.symbol] = {
          symbol: m.symbol,
          dep: m,
          exists: !!b,
          multiplier: xm ? readScaledMultiplier(Buffer.from(xm)) : null,
          mBase: b ? Number(b.readBigUInt64LE(104)) / 1e12 : null,
          maturity: b ? Number(b.readBigInt64LE(128)) : null,
          reserveD: rd,
          reserveUsdc: ru,
          lpSupply: m.lpMint ? u64At(lp, 36) : 0n,
          hasPool: !!m.lpMint && rd > 0n && ru > 0n,
          poolPrice: rd > 0n ? fromRaw(ru, USDC_DECIMALS) / fromRaw(rd, X_DECIMALS) : null,
        };
      });
      setMarkets(nm);
      if (owner) {
        const base = deps.length * 5;
        const np: Record<string, ChainPosition> = {};
        const nd: Record<string, number | null> = {};
        deps.forEach((m, i) => {
          const [x, p, d, lp, pos, drip] = infos.slice(base + i * 6, base + i * 6 + 6);
          const snap = pos ? Number(Buffer.from(pos).readBigUInt64LE(8)) / 1e12 : null;
          const mm = nm[m.symbol];
          const dBal = u64At(d, 64);
          np[m.symbol] = {
            x: u64At(x, 64),
            p: u64At(p, 64),
            d: dBal,
            lp: m.lpMint ? u64At(lp, 64) : 0n,
            snap,
            claimable: snap && mm.mBase && mm.multiplier ? couponClaim(dBal, mm.mBase, snap, mm.multiplier) : 0n,
          };
          nd[m.symbol] = drip ? Number(Buffer.from(drip).readBigInt64LE(8)) : null;
        });
        const tail = base + deps.length * 6;
        setUsdc(u64At(infos[tail], 64));
        nd.USDC = infos[tail + 1] ? Number(Buffer.from(infos[tail + 1]!).readBigInt64LE(8)) : null;
        setPositions(np);
        setDrips(nd);
        setSol((await connection.getBalance(owner, "confirmed")) / 1e9);
      } else {
        setPositions({});
        setDrips({});
        setSol(null);
        setUsdc(0n);
      }
      setLoaded(true);
    } catch (e) {
      console.warn("vault refresh failed", e);
    } finally {
      busy.current = false;
      if (again.current) { again.current = false; setTimeout(() => refreshRef.current(), 0); }
    }
  }, [vault, publicKey, connection]);
  const refreshRef = useRef(refresh);
  useEffect(() => { refreshRef.current = refresh; }, [refresh]);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 20_000);
    return () => clearInterval(t);
  }, [refresh]);

  const run = useCallback<Ctx["run"]>(
    async (label, ixs, mk) => {
      if (!publicKey) return null;
      setTx({ state: "signing", label });
      try {
        const tr = new Transaction().add(...ixs);
        const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
        tr.recentBlockhash = blockhash;
        tr.feePayer = publicKey;
        // simulate first so program errors surface with their message instead of a wallet warning
        const sim = await connection.simulateTransaction(tr);
        if (sim.value.err) {
          const logs = (sim.value.logs ?? []).join("\n");
          throw new Error(`${JSON.stringify(sim.value.err)}\n${logs}`);
        }
        const sig = await sendTransaction(tr, connection, { skipPreflight: true });
        setTx({ state: "confirming", label });
        const res = await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");
        if (res.value.err) throw new Error(JSON.stringify(res.value.err));
        const receipt = mk(sig);
        setTx({ state: "ok", label, receipt });
        setHistory((h) => {
          const n = [receipt, ...h].slice(0, 50);
          if (histKey) try { localStorage.setItem(histKey, JSON.stringify(n)); } catch {}
          return n;
        });
        await refresh();
        return sig;
      } catch (e) {
        setTx({ state: "err", label, error: explainError(e) });
        return null;
      }
    },
    [publicKey, connection, sendTransaction, refresh, histKey],
  );
  const closeTx = useCallback(() => setTx({ state: "idle" }), []);

  const api: Ctx = { vault, deployed: !!vault, owner: publicKey, sol, usdc, markets, positions, drips, loaded, refresh, tx, run, closeTx, history };
  return <VaultCtx.Provider value={api}>{children}</VaultCtx.Provider>;
}

export const useVault = () => {
  const c = useContext(VaultCtx);
  if (!c) throw new Error("VaultProvider missing");
  return c;
};
export const posOf = (v: Ctx, s: string) => v.positions[s] ?? EMPTY;
