"use client";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { MarketsProvider } from "./useMarkets";
import { VaultProvider } from "./useVault";
import { RPC_URL } from "@/lib/vault/deployment";


export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ConnectionProvider endpoint={RPC_URL}>
      <WalletProvider wallets={[]} autoConnect>
        <WalletModalProvider>
          <MarketsProvider>
            <VaultProvider>{children}</VaultProvider>
          </MarketsProvider>
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
