export interface Bump {
  at: string; // ISO
  prev: number;
  next: number;
  reason: string;
}

export interface MarketSnapshot {
  x: string;
  under: string;
  name: string;
  mint: string;
  hue: string;
  equity: number | null; // Pyth equity price
  equityPublish: number | null;
  xPrice: number | null; // price used for coupon math
  xPublish: number | null;
  priceSource: "pyth" | "jupiter" | "pyth-onchain" | "none";
  pythX: number | null; // Pyth xStock feed, as last published
  pythXPublish: number | null;
  multiplier: number | null; // effective now, from chain
  rawMultiplier: number | null;
  newMultiplier: number | null;
  newMultiplierEffective: number | null;
  bumps: Bump[];
  bumpsSource: "xstocks-api" | "chain-only";
  trailingYield: number; // last 365d product of bumps minus 1
  sinceLaunch: number; // multiplier - 1
  fair: number | null; // value of a 12m dividend claim on 1 unit
  bid: number | null;
  ask: number | null;
}

export interface SnapshotResponse {
  ok: boolean;
  at: number;
  markets: MarketSnapshot[];
  pythSource: "hermes" | "solana-pyth-receiver";
  sources: { pyth: string; rpc: string; history: string };
  errors: string[];
}
