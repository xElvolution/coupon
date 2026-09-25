"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";

export type Action = "split" | "sell" | "buy" | "redeem";
export interface Receipt { id: string; at: number; action: Action; x: string; amount: number; price?: number; cash?: number; multiplier?: number | null; devnetSig?: string }
export interface Position { x: number; p: number; d: number }
export interface LedgerState { cash: number; positions: Record<string, Position>; receipts: Receipt[] }

const START: LedgerState = { cash: 2500, positions: { SPYx: { x: 100, p: 0, d: 0 }, AAPLx: { x: 40, p: 0, d: 0 }, MSFTx: { x: 25, p: 0, d: 0 } }, receipts: [] };

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const rid = () => Array.from(crypto.getRandomValues(new Uint8Array(24)), (b) => B58[b % 58]).join("");

interface Ctx {
  state: LedgerState;
  owner: string;
  pos: (x: string) => Position;
  split: (x: string, amt: number, mult: number | null) => Receipt;
  redeem: (x: string, amt: number, mult: number | null) => Receipt;
  sell: (x: string, amt: number, price: number) => Receipt;
  buy: (x: string, amt: number, price: number) => Receipt;
  reset: () => void;
  attachSig: (id: string, sig: string) => void;
}
const LedgerCtx = createContext<Ctx | null>(null);

export function LedgerProvider({ children }: { children: React.ReactNode }) {
  const { publicKey } = useWallet();
  const owner = publicKey?.toBase58() ?? "guest";
  const key = `coupon.ledger.v1.${owner}`;
  const [state, setState] = useState<LedgerState>(START);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      setState(raw ? (JSON.parse(raw) as LedgerState) : START);
    } catch {
      setState(START);
    }
  }, [key]);
  const commit = useCallback(
    (fn: (s: LedgerState) => LedgerState) =>
      setState((s) => {
        const n = fn(s);
        try { localStorage.setItem(key, JSON.stringify(n)); } catch {}
        return n;
      }),
    [key],
  );
  const pos = useCallback((x: string) => state.positions[x] ?? { x: 0, p: 0, d: 0 }, [state]);
  const mk = (r: Omit<Receipt, "id" | "at">): Receipt => ({ ...r, id: rid(), at: Date.now() });
  const upd = (s: LedgerState, x: string, f: (p: Position) => Position, cash = 0, r?: Receipt): LedgerState => ({
    cash: s.cash + cash,
    positions: { ...s.positions, [x]: f(s.positions[x] ?? { x: 0, p: 0, d: 0 }) },
    receipts: r ? [r, ...s.receipts].slice(0, 60) : s.receipts,
  });
  const api = useMemo<Ctx>(
    () => ({
      state, owner, pos,
      split: (x, amt, multiplier) => { const r = mk({ action: "split", x, amount: amt, multiplier }); commit((s) => upd(s, x, (p) => ({ x: p.x - amt, p: p.p + amt, d: p.d + amt }), 0, r)); return r; },
      redeem: (x, amt, multiplier) => { const r = mk({ action: "redeem", x, amount: amt, multiplier }); commit((s) => upd(s, x, (p) => ({ x: p.x + amt, p: p.p - amt, d: p.d - amt }), 0, r)); return r; },
      sell: (x, amt, price) => { const r = mk({ action: "sell", x, amount: amt, price, cash: amt * price }); commit((s) => upd(s, x, (p) => ({ ...p, d: p.d - amt }), amt * price, r)); return r; },
      buy: (x, amt, price) => { const r = mk({ action: "buy", x, amount: amt, price, cash: -amt * price }); commit((s) => upd(s, x, (p) => ({ ...p, d: p.d + amt }), -amt * price, r)); return r; },
      reset: () => commit(() => START),
      attachSig: (id, sig) => commit((s) => ({ ...s, receipts: s.receipts.map((r) => (r.id === id ? { ...r, devnetSig: sig } : r)) })),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state, owner, pos, commit],
  );
  return <LedgerCtx.Provider value={api}>{children}</LedgerCtx.Provider>;
}

export const useLedger = () => {
  const c = useContext(LedgerCtx);
  if (!c) throw new Error("LedgerProvider missing");
  return c;
};
