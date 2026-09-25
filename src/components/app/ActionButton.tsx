"use client";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { useVault } from "../useVault";

/** Primary action: opens the wallet modal when no devnet wallet is connected. */
export function ActionButton({ label, connectLabel, disabled, onClick, className = "" }: { label: string; connectLabel: string; disabled?: boolean; onClick: () => void; className?: string }) {
  const v = useVault();
  const { setVisible } = useWalletModal();
  if (!v.deployed) return <button disabled className={`btn btn-lime h-[52px] w-full text-[15px] ${className}`}>Vault program not configured</button>;
  if (!v.owner) return <button onClick={() => setVisible(true)} className={`btn btn-lime h-[52px] w-full text-[15px] ${className}`}>{connectLabel}</button>;
  const busy = v.tx.state === "signing" || v.tx.state === "confirming";
  return <button disabled={disabled || busy} onClick={onClick} className={`btn btn-lime h-[52px] w-full text-[15px] ${className}`}>{busy ? "Waiting for wallet…" : label}</button>;
}
