// Multiplier keeper: mirrors each mainnet xStock multiplier onto its devnet test mint.
// Reads the devnet mint, compares with the mainnet value, and submits the admin `bump` only when
// mainnet is higher. Used by scripts/keeper.ts and the cron route /api/keeper.
import { Connection, Keypair, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import { CouponVault, readScaledMultiplier, type Deployment } from "./sdk";

export type KeeperRow = { symbol: string; mainnet: number | null; devnet: number | null; action: "in sync" | "devnet ahead" | "bumped" | "would bump" | "no data"; sig?: string };

export async function runKeeper(conn: Connection, dep: Deployment, mainnet: Record<string, number | null | undefined>, admin: Keypair | null): Promise<KeeperRow[]> {
  const v = new CouponVault(dep);
  const markets = dep.markets.filter((m) => !m.testOnly);
  const mints = await conn.getMultipleAccountsInfo(markets.map((m) => v.keys(m).x), "confirmed");
  const rows: KeeperRow[] = [];
  for (const [i, m] of markets.entries()) {
    const main = mainnet[m.symbol] ?? null;
    const dev = mints[i] ? readScaledMultiplier(Buffer.from(mints[i]!.data)) : null;
    if (main == null || dev == null) {
      rows.push({ symbol: m.symbol, mainnet: main, devnet: dev, action: "no data" });
      continue;
    }
    // 1e-12 relative tolerance: the mint stores an f64, the program compares in 1e12 fixed point
    if (main <= dev * (1 + 1e-12)) {
      rows.push({ symbol: m.symbol, mainnet: main, devnet: dev, action: Math.abs(main - dev) <= dev * 1e-12 ? "in sync" : "devnet ahead" });
      continue;
    }
    if (!admin) {
      rows.push({ symbol: m.symbol, mainnet: main, devnet: dev, action: "would bump" });
      continue;
    }
    const sig = await sendAndConfirmTransaction(conn, new Transaction().add(v.bump(admin.publicKey, m, main)), [admin], { commitment: "confirmed" });
    rows.push({ symbol: m.symbol, mainnet: main, devnet: dev, action: "bumped", sig });
  }
  return rows;
}

/** Admin key from a server env var: a JSON byte array (solana-keygen format). Never shipped to the client. */
export function adminFromEnv(raw: string | undefined): Keypair | null {
  if (!raw) return null;
  try {
    return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw)));
  } catch {
    return null;
  }
}
