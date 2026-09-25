"use client";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { MarketsProvider } from "./useMarkets";
import { VaultProvider } from "./useVault";
import { RPC_URL } from "@/lib/vault/deployment";


import type { SnapshotResponse } from "@/lib/types";
import type { ChainMarket } from "@/lib/vault/chain-markets";

export default function Providers({ children, initial, initialMarkets }: { children: React.ReactNode; initial?: SnapshotResponse | null; initialMarkets?: Record<string, ChainMarket> | null }) {
  return (
    <ConnectionProvider endpoint={RPC_URL}>
      <WalletProvider wallets={[]} autoConnect>
        <WalletModalProvider>
          <MarketsProvider initial={initial}>
            <VaultProvider initialMarkets={initialMarkets}>{children}</VaultProvider>
          </MarketsProvider>
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
