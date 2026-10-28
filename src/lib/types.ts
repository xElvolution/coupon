export interface Bump {
  at: string; // ISO
  prev: number;
  next: number;
  reason: string;
}

export interface PythFeedDetail {
  price: number;
  conf: number;
  confBps: number;
  emaPrice: number;
  emaConf: number;
  publish: number;
  prevPublish: number;
  postedSlot: number;
  feedId: string;
  account: string;
  symbol: string;
  channel: string;
}

export interface YieldCurveTenor {
  tenor: "3M" | "6M" | "12M" | "24M";
  days: number;
  impliedYieldPct: number;
  forwardDivUsd: number;
  impliedMult: number;
  discountFactor: number;
  treasurySpreadBps: number;
}

export interface PythTelemetry {
  equityFeed: PythFeedDetail | null;
  xFeed: PythFeedDetail | null;
  rrFeed: PythFeedDetail | null;
  pegBasisBps: number;
  emaSpreadBps: number;
  rrVsMultBps: number;
  combinedConfBps: number;
  riskStatus: "NOMINAL" | "EXTENDED_HOURS" | "GUARDED";
  maxLeverage: number;
  sessionStatus: "REGULAR" | "EXTENDED" | "OVERNIGHT";
}

export interface PerpMarketSnapshot {
  symbol: string;
  xSymbol: string;
  under: string;
  name: string;
  indexYieldPct: number;
  markYieldPct: number;
  indexPriceUsd: number;
  markPriceUsd: number;
  fundingRate8hBps: number;
  openInterestUsd: number;
  volume24hUsd: number;
  maxLeverage: number;
  maintenanceMarginPct: number;
  nextFundingSecs: number;
  riskStatus: "NOMINAL" | "EXTENDED_HOURS" | "GUARDED";
}

export interface OutcomeMarket {
  id: string;
  xSymbol: string;
  under: string;
  category: "MULTIPLIER_STEP" | "REDEMPTION_PEG" | "ANNUAL_YIELD" | "CROSS_ASSET";
  title: string;
  subtitle: string;
  resolveDate: string;
  oracleSource: string;
  oracleProgram: string;
  targetMetricLabel: string;
  currentMetricValue: string;
  thresholdLabel: string;
  yesPrice: number;
  noPrice: number;
  yesReserve: number;
  noReserve: number;
  liquidityUsd: number;
  volume24hUsd: number;
  verifiedTxSig?: string;
}

export interface MarketSnapshot {
  x: string;
  under: string;
  name: string;
  mint: string;
  hue: string;
  equityFeedSymbol: string;
  xFeedSymbol: string;
  rrFeedSymbol: string;
  nextExDate: string;
  quarterlyBpsEst: number;
  equity: number | null; // Pyth equity price
  equityPublish: number | null;
  xPrice: number | null; // price used for coupon math
  xPublish: number | null;
  priceSource: "pyth" | "jupiter" | "pyth-onchain" | "none";
  pythX: number | null; // Pyth xStock feed, as last published
  pythXPublish: number | null;
  rrPrice: number | null; // Pyth Crypto Redemption Rate (.RR)
  rrPublish: number | null;
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
  pythTelemetry: PythTelemetry;
  yieldCurve: YieldCurveTenor[];
  perp: PerpMarketSnapshot | null;
}

export interface SnapshotResponse {
  ok: boolean;
  at: number;
  slot: number;
  markets: MarketSnapshot[];
  outcomes: OutcomeMarket[];
  verifiedOrders: {
    kind: "perp" | "outcome";
    id: string;
    xSymbol: string;
    side: string;
    leverage: number | null;
    usdcAmount: number;
    sig: string;
    at: string;
  }[];
  pythSession: {
    isOpen: boolean;
    session: "REGULAR" | "EXTENDED" | "OVERNIGHT";
    nextOpen: number | null;
    nextClose: number | null;
    hermesEndpoint: string;
    solanaPushProgram: string;
  };
  pythSource: "hermes" | "solana-pyth-receiver";
  sources: { pyth: string; rpc: string; history: string };
  errors: string[];
}
