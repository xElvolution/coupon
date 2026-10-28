export type PredictionCategory = "Dividends" | "Earnings & Splits" | "Price Targets";
export type TimeframeKey = "1H" | "1D" | "1W" | "1M" | "ALL";

export interface ProbPoint {
  t: string;
  yes: number;
  no: number;
  vol: number;
}

export interface OrderLevel {
  priceCents: number;
  shares: number;
  totalUsd: number;
}

export interface PredictionTrade {
  id: string;
  wallet: string;
  side: "YES" | "NO";
  action: "Buy" | "Sell";
  shares: number;
  priceCents: number;
  totalUsd: number;
  timeAgo: string;
  sig: string;
}

export interface PredictionComment {
  id: string;
  author: string;
  badge: string;
  side: "YES" | "NO";
  positionText: string;
  text: string;
  timeAgo: string;
  likes: number;
}

export interface PredictionMarket {
  id: string;
  symbol: string;
  company: string;
  category: PredictionCategory;
  title: string;
  subtitle: string;
  yesCents: number;
  noCents: number;
  change24h: string;
  change24hNum: number;
  volumeUsd: number;
  liquidityUsd: number;
  tradersCount: number;
  commentsCount: number;
  endDate: string;
  featured?: boolean;
  currentMetricLabel: string;
  currentMetricValue: string;
  targetMetricValue: string;
  rulesSummary: string;
  resolutionSource: string;
  onchainMint: string;
  sparkline: number[];
  series: Record<TimeframeKey, ProbPoint[]>;
  orderbook: {
    yesBids: OrderLevel[];
    yesAsks: OrderLevel[];
    noBids: OrderLevel[];
    noAsks: OrderLevel[];
  };
  recentTrades: PredictionTrade[];
  comments: PredictionComment[];
}

function buildSeries(baseYes: number, drift: number, volatility: number): Record<TimeframeKey, ProbPoint[]> {
  const make = (count: number, labelFn: (i: number) => string, stepVol: number): ProbPoint[] => {
    const pts: ProbPoint[] = [];
    let cur = Math.max(8, Math.min(92, baseYes - drift));
    for (let i = 0; i < count; i++) {
      const progress = i / Math.max(1, count - 1);
      const wave = Math.sin(i * 0.65) * volatility + Math.cos(i * 0.35) * (volatility * 0.6);
      cur = i === count - 1 ? baseYes : Math.round(Math.max(4, Math.min(96, baseYes - drift * (1 - progress) + wave)) * 10) / 10;
      pts.push({
        t: labelFn(i),
        yes: cur,
        no: Math.round((100 - cur) * 10) / 10,
        vol: Math.round((stepVol + Math.abs(wave) * 420) * 100) / 100,
      });
    }
    return pts;
  };

  return {
    "1H": make(16, (i) => `${60 - i * 4}m ago`, 1250),
    "1D": make(24, (i) => `${String(i).padStart(2, "0")}:00`, 3800),
    "1W": make(21, (i) => `Oct ${8 + i}`, 11400),
    "1M": make(26, (i) => `Oct ${3 + i}`, 18900),
    "ALL": make(30, (i) => `Day ${i + 1}`, 26400),
  };
}

function buildBook(yesCents: number) {
  const noCents = 100 - yesCents;
  const yesBids: OrderLevel[] = [
    { priceCents: yesCents - 1, shares: 4820, totalUsd: Math.round(4820 * (yesCents - 1)) / 100 },
    { priceCents: yesCents - 2, shares: 9150, totalUsd: Math.round(9150 * (yesCents - 2)) / 100 },
    { priceCents: yesCents - 3, shares: 14600, totalUsd: Math.round(14600 * (yesCents - 3)) / 100 },
    { priceCents: yesCents - 4, shares: 22400, totalUsd: Math.round(22400 * (yesCents - 4)) / 100 },
    { priceCents: yesCents - 6, shares: 31800, totalUsd: Math.round(31800 * (yesCents - 6)) / 100 },
  ];
  const yesAsks: OrderLevel[] = [
    { priceCents: yesCents + 1, shares: 4100, totalUsd: Math.round(4100 * (yesCents + 1)) / 100 },
    { priceCents: yesCents + 2, shares: 8740, totalUsd: Math.round(8740 * (yesCents + 2)) / 100 },
    { priceCents: yesCents + 3, shares: 13200, totalUsd: Math.round(13200 * (yesCents + 3)) / 100 },
    { priceCents: yesCents + 5, shares: 19850, totalUsd: Math.round(19850 * (yesCents + 5)) / 100 },
    { priceCents: yesCents + 7, shares: 28900, totalUsd: Math.round(28900 * (yesCents + 7)) / 100 },
  ];
  const noBids: OrderLevel[] = [
    { priceCents: noCents - 1, shares: 5120, totalUsd: Math.round(5120 * (noCents - 1)) / 100 },
    { priceCents: noCents - 2, shares: 8900, totalUsd: Math.round(8900 * (noCents - 2)) / 100 },
    { priceCents: noCents - 3, shares: 15200, totalUsd: Math.round(15200 * (noCents - 3)) / 100 },
    { priceCents: noCents - 5, shares: 24100, totalUsd: Math.round(24100 * (noCents - 5)) / 100 },
  ];
  const noAsks: OrderLevel[] = [
    { priceCents: noCents + 1, shares: 4650, totalUsd: Math.round(4650 * (noCents + 1)) / 100 },
    { priceCents: noCents + 2, shares: 9400, totalUsd: Math.round(9400 * (noCents + 2)) / 100 },
    { priceCents: noCents + 4, shares: 16800, totalUsd: Math.round(16800 * (noCents + 4)) / 100 },
    { priceCents: noCents + 6, shares: 26300, totalUsd: Math.round(26300 * (noCents + 6)) / 100 },
  ];
  return { yesBids, yesAsks, noBids, noAsks };
}

export const PREDICTION_MARKETS: PredictionMarket[] = [
  {
    id: "spyx-q4-div",
    symbol: "SPYx",
    company: "S&P 500",
    category: "Dividends",
    title: "Will S&P 500 (SPYx) Q4 2026 dividend payout exceed $1.95 per share?",
    subtitle: "Resolves YES if the Q4 2026 Token-2022 multiplier bump on SPYx implies a cash-equivalent distribution above $1.95 per unit.",
    yesCents: 68,
    noCents: 32,
    change24h: "+4.2%",
    change24hNum: 4.2,
    volumeUsd: 284520,
    liquidityUsd: 94200,
    tradersCount: 1428,
    commentsCount: 84,
    endDate: "Dec 31, 2026",
    featured: true,
    currentMetricLabel: "Q3 2026 Distribution",
    currentMetricValue: "$1.89 / share",
    targetMetricValue: "> $1.95 / share",
    rulesSummary:
      "This market resolves to YES if the cumulative Token-2022 ScaledUiAmountConfig multiplier increase on the Solana mainnet SPYx mint (XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W) between Oct 1, 2026 and Dec 31, 2026 23:59 UTC multiplied by the SPYx reference price exceeds $1.95 per share. Otherwise resolves to NO.",
    resolutionSource: "Solana Mainnet Token-2022 Mint + Official S&P 500 Distribution Schedule",
    onchainMint: "XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W",
    sparkline: [54, 56, 55, 59, 62, 61, 65, 68],
    series: buildSeries(68, 14, 3.2),
    orderbook: buildBook(68),
    recentTrades: [
      { id: "t1", wallet: "7xKX…9pQm", side: "YES", action: "Buy", shares: 1250, priceCents: 68, totalUsd: 850.0, timeAgo: "18s ago", sig: "2nhH3Wz7DTqz4aMJiCj33dQt1oYdTemsBdWYfs9SyjAJJGX5ptVhPUQyCjAxrET9YTpp1K1bVfN3Tc7DAKnyb7B2" },
      { id: "t2", wallet: "4vRt…3kLp", side: "NO", action: "Buy", shares: 640, priceCents: 32, totalUsd: 204.8, timeAgo: "2m ago", sig: "49rSbVS6v61Cq16cbGqE4TFErYGVHvitpHNAV3iPH8ogiLdKcWN68mBmTpHqQMdq25zeRSkoKG9HztWv7v6YhfTv" },
      { id: "t3", wallet: "9mNb…8wZa", side: "YES", action: "Buy", shares: 3400, priceCents: 67, totalUsd: 2278.0, timeAgo: "6m ago", sig: "5xYz9Wz7DTqz4aMJiCj33dQt1oYdTemsBdWYfs9SyjAJJGX5ptVhPUQyCjAxrET9YTpp1K1bVfN3Tc7DAKnyb7B2" },
      { id: "t4", wallet: "3cDf…1qWe", side: "YES", action: "Sell", shares: 500, priceCents: 67, totalUsd: 335.0, timeAgo: "14m ago", sig: "3kLm8Wz7DTqz4aMJiCj33dQt1oYdTemsBdWYfs9SyjAJJGX5ptVhPUQyCjAxrET9YTpp1K1bVfN3Tc7DAKnyb7B2" },
    ],
    comments: [
      { id: "c1", author: "MacroYieldDesk", badge: "Top Trader", side: "YES", positionText: "14,200 YES", text: "S&P 500 Q4 seasonal dividend step is historically the largest quarter of the year. With tech components hiking payouts, $1.95 is very achievable.", timeAgo: "24m ago", likes: 31 },
      { id: "c2", author: "SolanaFixedIncome", badge: "Verified Holder", side: "YES", positionText: "5,500 YES", text: "Hedging my dSPYx coupon inventory here. If Q4 bumps clear +34 bps on the multiplier, YES pays $1.00 cleanly.", timeAgo: "1h ago", likes: 19 },
    ],
  },
  {
    id: "nvda-div-hike",
    symbol: "NVDAx",
    company: "NVIDIA",
    category: "Earnings & Splits",
    title: "Will NVIDIA (NVDAx) announce a dividend increase before Q4 earnings?",
    subtitle: "Tracks whether NVIDIA's board declares a quarterly cash dividend above $0.01/share in its November earnings release.",
    yesCents: 42,
    noCents: 58,
    change24h: "+6.8%",
    change24hNum: 6.8,
    volumeUsd: 519240,
    liquidityUsd: 162800,
    tradersCount: 2890,
    commentsCount: 142,
    endDate: "Nov 26, 2026",
    featured: true,
    currentMetricLabel: "Current Quarterly Div",
    currentMetricValue: "$0.01 / share",
    targetMetricValue: ">= $0.02 / share",
    rulesSummary:
      "Resolves YES if NVIDIA Corporation officially declares a quarterly cash dividend greater than $0.01 per share (or equivalent NVDAx Token-2022 multiplier step) on or before November 26, 2026. Otherwise resolves NO.",
    resolutionSource: "NVIDIA Investor Relations + NVDAx Mainnet Mint",
    onchainMint: "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh",
    sparkline: [31, 33, 35, 34, 38, 40, 39, 42],
    series: buildSeries(42, 11, 4.1),
    orderbook: buildBook(42),
    recentTrades: [
      { id: "n1", wallet: "8kPq…2mNv", side: "YES", action: "Buy", shares: 2500, priceCents: 42, totalUsd: 1050.0, timeAgo: "42s ago", sig: "49rSbVS6v61Cq16cbGqE4TFErYGVHvitpHNAV3iPH8ogiLdKcWN68mBmTpHqQMdq25zeRSkoKG9HztWv7v6YhfTv" },
      { id: "n2", wallet: "2wEr…9tYu", side: "NO", action: "Buy", shares: 1800, priceCents: 58, totalUsd: 1044.0, timeAgo: "4m ago", sig: "2nhH3Wz7DTqz4aMJiCj33dQt1oYdTemsBdWYfs9SyjAJJGX5ptVhPUQyCjAxrET9YTpp1K1bVfN3Tc7DAKnyb7B2" },
    ],
    comments: [
      { id: "nc1", author: "JensenCap", badge: "Whale", side: "NO", positionText: "22,000 NO", text: "NVIDIA prefers share buybacks over dividend hikes right now while Blackwell capex ramps.", timeAgo: "45m ago", likes: 44 },
      { id: "nc2", author: "SemiAlpha", badge: "Contributor", side: "YES", positionText: "8,400 YES", text: "At 42 cents the risk/reward on a surprise cash return announcement is super asymmetric.", timeAgo: "2h ago", likes: 27 },
    ],
  },
  {
    id: "aapl-buyback-div",
    symbol: "AAPLx",
    company: "Apple",
    category: "Dividends",
    title: "Will Apple (AAPLx) distribute at least $0.26 per share in November 2026?",
    subtitle: "Resolves on Apple's November ex-dividend multiplier bump on the AAPLx Solana Token-2022 mint.",
    yesCents: 76,
    noCents: 24,
    change24h: "+1.9%",
    change24hNum: 1.9,
    volumeUsd: 198400,
    liquidityUsd: 78500,
    tradersCount: 964,
    commentsCount: 51,
    endDate: "Nov 14, 2026",
    featured: false,
    currentMetricLabel: "Prior Payout",
    currentMetricValue: "$0.25 / share",
    targetMetricValue: ">= $0.26 / share",
    rulesSummary:
      "Resolves YES if the November 2026 dividend distribution recorded on AAPLx (XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp) equals or exceeds $0.26 per share.",
    resolutionSource: "AAPLx Mainnet Mint Multiplier",
    onchainMint: "XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp",
    sparkline: [69, 71, 70, 73, 74, 75, 75, 76],
    series: buildSeries(76, 7, 2.1),
    orderbook: buildBook(76),
    recentTrades: [
      { id: "a1", wallet: "6hJk…4pLo", side: "YES", action: "Buy", shares: 900, priceCents: 76, totalUsd: 684.0, timeAgo: "1m ago", sig: "2nhH3Wz7DTqz4aMJiCj33dQt1oYdTemsBdWYfs9SyjAJJGX5ptVhPUQyCjAxrET9YTpp1K1bVfN3Tc7DAKnyb7B2" },
    ],
    comments: [
      { id: "ac1", author: "CupertinoYield", badge: "Verified Holder", side: "YES", positionText: "9,100 YES", text: "Apple's dividend cadence is clockwork. 76¢ is solid carry into mid-November.", timeAgo: "3h ago", likes: 18 },
    ],
  },
  {
    id: "msft-yield-beat",
    symbol: "MSFTx",
    company: "Microsoft",
    category: "Dividends",
    title: "Will Microsoft (MSFTx) 12-month dividend growth beat QQQx in 2026?",
    subtitle: "Compares full-year 2026 Token-2022 multiplier growth on MSFTx vs. QQQx on Solana mainnet.",
    yesCents: 81,
    noCents: 19,
    change24h: "+2.4%",
    change24hNum: 2.4,
    volumeUsd: 146050,
    liquidityUsd: 64100,
    tradersCount: 712,
    commentsCount: 38,
    endDate: "Dec 31, 2026",
    featured: false,
    currentMetricLabel: "MSFTx vs QQQx Spread",
    currentMetricValue: "+18.4 bps lead",
    targetMetricValue: "MSFTx > QQQx",
    rulesSummary:
      "Resolves YES if the trailing 12-month percentage growth of the MSFTx Token-2022 multiplier exceeds that of QQQx on December 31, 2026 at 23:59 UTC.",
    resolutionSource: "MSFTx & QQQx Solana Mainnet Mints",
    onchainMint: "XspzcW1PRtgf6Wj92HCiZdjzKCyFekVD8P5Ueh3dRMX",
    sparkline: [72, 74, 76, 75, 78, 79, 80, 81],
    series: buildSeries(81, 9, 1.8),
    orderbook: buildBook(81),
    recentTrades: [
      { id: "m1", wallet: "5tGb…8nJm", side: "YES", action: "Buy", shares: 1500, priceCents: 81, totalUsd: 1215.0, timeAgo: "3m ago", sig: "49rSbVS6v61Cq16cbGqE4TFErYGVHvitpHNAV3iPH8ogiLdKcWN68mBmTpHqQMdq25zeRSkoKG9HztWv7v6YhfTv" },
    ],
    comments: [],
  },
  {
    id: "tsla-first-div",
    symbol: "TSLAx",
    company: "Tesla",
    category: "Earnings & Splits",
    title: "Will Tesla (TSLAx) declare a special dividend or stock split in Q4 2026?",
    subtitle: "High-volatility event contract on whether Tesla announces a capital distribution or share split before year-end.",
    yesCents: 18,
    noCents: 82,
    change24h: "-3.1%",
    change24hNum: -3.1,
    volumeUsd: 642800,
    liquidityUsd: 215000,
    tradersCount: 3640,
    commentsCount: 219,
    endDate: "Dec 31, 2026",
    featured: true,
    currentMetricLabel: "Trailing Dividend",
    currentMetricValue: "0.00% (No div)",
    targetMetricValue: "Split or Special Div",
    rulesSummary:
      "Resolves YES if Tesla Inc. formally announces either a stock split or a cash/special dividend on or before December 31, 2026 23:59 UTC.",
    resolutionSource: "SEC Form 8-K + TSLAx Mint State",
    onchainMint: "XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB",
    sparkline: [25, 24, 22, 23, 21, 19, 20, 18],
    series: buildSeries(18, -7, 3.8),
    orderbook: buildBook(18),
    recentTrades: [
      { id: "ts1", wallet: "9pLm…7xQa", side: "NO", action: "Buy", shares: 4200, priceCents: 82, totalUsd: 3444.0, timeAgo: "35s ago", sig: "2nhH3Wz7DTqz4aMJiCj33dQt1oYdTemsBdWYfs9SyjAJJGX5ptVhPUQyCjAxrET9YTpp1K1bVfN3Tc7DAKnyb7B2" },
    ],
    comments: [],
  },
  {
    id: "spyx-600-eoy",
    symbol: "SPYx",
    company: "S&P 500",
    category: "Price Targets",
    title: "Will SPYx close above $610.00 on the final trading day of 2026?",
    subtitle: "Year-end benchmark price target market settled by the official SPYx oracle close on Dec 31, 2026.",
    yesCents: 61,
    noCents: 39,
    change24h: "+3.5%",
    change24hNum: 3.5,
    volumeUsd: 412190,
    liquidityUsd: 138400,
    tradersCount: 1950,
    commentsCount: 97,
    endDate: "Dec 31, 2026",
    featured: false,
    currentMetricLabel: "Live SPYx Spot",
    currentMetricValue: "$584.42",
    targetMetricValue: "> $610.00",
    rulesSummary:
      "Resolves YES if the official closing price of SPYx on December 31, 2026 is strictly greater than $610.00 USD.",
    resolutionSource: "Solana Onchain Price Feed at 21:00 UTC Dec 31, 2026",
    onchainMint: "XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W",
    sparkline: [51, 53, 52, 56, 58, 57, 60, 61],
    series: buildSeries(61, 10, 2.9),
    orderbook: buildBook(61),
    recentTrades: [
      { id: "sp2", wallet: "3vBn…5mKl", side: "YES", action: "Buy", shares: 1600, priceCents: 61, totalUsd: 976.0, timeAgo: "2m ago", sig: "49rSbVS6v61Cq16cbGqE4TFErYGVHvitpHNAV3iPH8ogiLdKcWN68mBmTpHqQMdq25zeRSkoKG9HztWv7v6YhfTv" },
    ],
    comments: [],
  },
  {
    id: "meta-div-step",
    symbol: "METAx",
    company: "Meta",
    category: "Dividends",
    title: "Will Meta (METAx) Q4 dividend multiplier step exceed +12 bps?",
    subtitle: "Tracks Meta's fourth-quarter dividend reinvestment bump on the METAx Token-2022 mint.",
    yesCents: 54,
    noCents: 46,
    change24h: "+1.2%",
    change24hNum: 1.2,
    volumeUsd: 118900,
    liquidityUsd: 52300,
    tradersCount: 540,
    commentsCount: 29,
    endDate: "Dec 20, 2026",
    featured: false,
    currentMetricLabel: "Last Quarterly Step",
    currentMetricValue: "+10.8 bps",
    targetMetricValue: "> +12.0 bps",
    rulesSummary:
      "Resolves YES if the Q4 2026 ScaledUiAmountConfig multiplier step on METAx (Xsa62P5mvPszXL1krVUnU5ar38bBSVcWAB6fmPCo5Zu) exceeds 0.0012 (+12 bps).",
    resolutionSource: "METAx Solana Mainnet Mint",
    onchainMint: "Xsa62P5mvPszXL1krVUnU5ar38bBSVcWAB6fmPCo5Zu",
    sparkline: [49, 50, 51, 53, 52, 53, 54, 54],
    series: buildSeries(54, 5, 2.2),
    orderbook: buildBook(54),
    recentTrades: [],
    comments: [],
  },
  {
    id: "googl-div-yield",
    symbol: "GOOGLx",
    company: "Alphabet",
    category: "Dividends",
    title: "Will Alphabet (GOOGLx) distribute at least $0.22/share in Q4 dividends?",
    subtitle: "Resolves on Alphabet's Q4 2026 cash dividend and corresponding GOOGLx multiplier adjustment.",
    yesCents: 72,
    noCents: 28,
    change24h: "+2.7%",
    change24hNum: 2.7,
    volumeUsd: 164300,
    liquidityUsd: 68900,
    tradersCount: 815,
    commentsCount: 44,
    endDate: "Dec 18, 2026",
    featured: false,
    currentMetricLabel: "Prior Quarterly Div",
    currentMetricValue: "$0.20 / share",
    targetMetricValue: ">= $0.22 / share",
    rulesSummary:
      "Resolves YES if Alphabet Inc.'s Q4 2026 dividend distribution reflected on GOOGLx (XsCPL9dNWBMvFtTmwcCA5v3xWPSMEBCszbQdiLLq6aN) is at least $0.22 per share.",
    resolutionSource: "GOOGLx Solana Mainnet Mint",
    onchainMint: "XsCPL9dNWBMvFtTmwcCA5v3xWPSMEBCszbQdiLLq6aN",
    sparkline: [64, 66, 67, 68, 70, 69, 71, 72],
    series: buildSeries(72, 8, 2.0),
    orderbook: buildBook(72),
    recentTrades: [],
    comments: [],
  },
];

export interface UserPredictionPosition {
  id: string;
  marketId: string;
  symbol: string;
  title: string;
  side: "YES" | "NO";
  shares: number;
  avgPriceCents: number;
  costUsd: number;
  openedAt: number;
  sig: string;
}

const POS_STORAGE_KEY = "coupon.predictions.positions.v2";

export function loadPredictionPositions(): UserPredictionPosition[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(POS_STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as UserPredictionPosition[];
  } catch {
    return [];
  }
}

export function savePredictionPositions(list: UserPredictionPosition[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(POS_STORAGE_KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
}
