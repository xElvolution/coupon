"use client";
import { useCallback, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useDevnetReceipt } from "../useDevnetReceipt";
import { useLedger, type Receipt } from "../useLedger";

export type DevnetState = { state: "idle" | "nowallet" | "pending" | "ok" | "err"; sig?: string; error?: string };

export function useReceiptFlow() {
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [devnet, setDevnet] = useState<DevnetState>({ state: "idle" });
  const record = useDevnetReceipt();
  const { publicKey } = useWallet();
  const L = useLedger();
  const push = useCallback(
    async (r: Receipt) => {
      if (!publicKey) { setDevnet({ state: "nowallet" }); return; }
      setDevnet({ state: "pending" });
      const res = await record(r);
      if (res.sig) { L.attachSig(r.id, res.sig); setDevnet({ state: "ok", sig: res.sig }); }
      else setDevnet({ state: "err", error: res.error });
    },
    [publicKey, record, L],
  );
  const open = useCallback((r: Receipt) => { setReceipt(r); push(r); }, [push]);
  const retry = useCallback(() => { if (receipt) push(receipt); }, [receipt, push]);
  const close = useCallback(() => { setReceipt(null); setDevnet({ state: "idle" }); }, []);
  return { receipt, devnet, open, retry, close };
}
