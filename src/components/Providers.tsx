"use client";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { MarketsProvider } from "./useMarkets";
import { LedgerProvider } from "./useLedger";

const DEVNET = "https://api.devnet.solana.com";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ConnectionProvider endpoint={DEVNET}>
      <WalletProvider wallets={[]} autoConnect>
        <WalletModalProvider>
          <MarketsProvider>
            <LedgerProvider>{children}</LedgerProvider>
          </MarketsProvider>
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
