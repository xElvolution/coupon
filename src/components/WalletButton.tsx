"use client";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { short } from "@/lib/format";

export default function WalletButton({ compact = false }: { compact?: boolean }) {
  const { publicKey, connecting, disconnect, wallet } = useWallet();
  const { setVisible } = useWalletModal();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  if (!mounted || !publicKey)
    return (
      <button onClick={() => setVisible(true)} className={`btn btn-lime ${compact ? "h-11 px-4 text-sm md:h-10" : "h-11 px-5 text-sm"}`}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="6" width="20" height="14" rx="3" /><path d="M16 13h2M2 10h20" /></svg>
        {connecting ? "Connecting" : "Connect wallet"}
      </button>
    );
  const addr = publicKey.toBase58();
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((o) => !o)} className="btn btn-line h-11 px-3 text-sm md:h-10">
        {wallet?.adapter.icon && <img src={wallet.adapter.icon} alt="" className="h-5 w-5 rounded" />}
        <span className="num">{short(addr)}</span>
        <span className="h-2 w-2 rounded-full bg-lime" />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, y: -6, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6, scale: 0.98 }} transition={{ duration: 0.18 }} className="card absolute right-0 z-50 mt-2 w-64 p-2 text-sm">
            <div className="px-3 py-2">
              <div className="text-[11px] uppercase tracking-[0.14em] text-dim">Connected · Devnet</div>
              <div className="num mt-1 break-all text-xs text-dim">{addr}</div>
            </div>
            <button onClick={() => { navigator.clipboard?.writeText(addr); setOpen(false); }} className="w-full rounded-xl px-3 py-2 text-left hover:bg-surface-2">Copy address</button>
            <a href={`https://explorer.solana.com/address/${addr}?cluster=devnet`} target="_blank" rel="noreferrer" className="block rounded-xl px-3 py-2 hover:bg-surface-2">View on explorer</a>
            <button onClick={() => { disconnect(); setOpen(false); }} className="w-full rounded-xl px-3 py-2 text-left text-ink hover:bg-surface-2">Disconnect</button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
