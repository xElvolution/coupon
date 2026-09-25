"use client";
import { useCallback } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey, Transaction, TransactionInstruction } from "@solana/web3.js";
import type { Receipt } from "./useLedger";
import { Buffer } from "buffer";

const MEMO = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");

/**
 * Writes a ledger action to Solana devnet as a Memo transaction signed by the connected wallet.
 * It is a real devnet signature for the record, not a token transfer.
 */
export function useDevnetReceipt() {
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();
  return useCallback(
    async (r: Receipt): Promise<{ sig?: string; error?: string }> => {
      if (!publicKey) return { error: "Connect a wallet to also record this on devnet." };
      try {
        const memo = `COUPON v1 ${r.action} ${r.amount} ${r.action === "sell" || r.action === "buy" ? "d" : ""}${r.x}${r.price ? ` @${r.price.toFixed(6)}` : ""}${r.multiplier ? ` m=${r.multiplier}` : ""} id=${r.id.slice(0, 12)}`;
        const tx = new Transaction().add(new TransactionInstruction({ programId: MEMO, keys: [{ pubkey: publicKey, isSigner: true, isWritable: false }], data: Buffer.from(memo, "utf8") }));
        const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
        tx.recentBlockhash = blockhash;
        tx.feePayer = publicKey;
        const sig = await sendTransaction(tx, connection);
        await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");
        return { sig };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return { error: /insufficient|0x1|debit an account/i.test(msg) ? "Wallet has no devnet SOL for the fee." : /reject/i.test(msg) ? "Signature declined in wallet." : msg.slice(0, 120) };
      }
    },
    [connection, publicKey, sendTransaction],
  );
}
