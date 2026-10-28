export type PerpTimeframe = "1m" | "5m" | "15m" | "1h" | "4h" | "1D" | "1W";

export interface PerpCandle {
  t: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  turnoverUsd: number;
  ma7: number;
  ma14: number;
  ma28: number;
  ema20: number;
  divYield: number;
}

export interface PerpBookRow {
  price: number;
  size: number;
  totalUsd: number;
}

export interface PerpTradeRow {
  id: string;
  price: number;
  size: number;
  side: "LONG" | "SHORT";
  time: string;
  sig: string;
}

export interface PerpFinancialQuarter {
  period: string;
  revenueB: number;
  netIncomeB: number;
  assetsB: number;
  liabilitiesB: number;
  debtToAssetPct: number;
}

export interface PerpMarket {
  ticker: string;
  symbol: string;
  name: string;
  companyFull: string;
  sector: string;
  industry: string;
  exchange: string;
  listingDate: string;
  headquarters: string;
  employees: string;
  website: string;
  mintAddress: string;
  overview: string;
  markPrice: number;
  indexPrice: number;
  open24h: number;
  prevClose: number;
  change24hUsd: number;
  change24hPct: number;
  high24h: number;
  low24h: number;
  volume24hShares: string;
  volume24hUsd: number;
  turnoverRatePct: string;
  peTtm: string;
  marketCap: string;
  openInterestUsd: number;
  longSkewPct: number;
  fundingHourlyPct: number;
  dividendYieldApy: number;
  dividendPerShare: string;
  dividendFrequency: string;
  nextExDivDate: string;
  tokenMultiplier: string;
  maxLeverage: number;
  sparkline: number[];
  candles: Record<PerpTimeframe, PerpCandle[]>;
  asks: PerpBookRow[];
  bids: PerpBookRow[];
  recentTrades: PerpTradeRow[];
  quarterlyFinancials: PerpFinancialQuarter[];
  annualFinancials: PerpFinancialQuarter[];
}

function generateCandles(
  spot: number,
  volatilityPct: number,
  baseDivYield: number
): Record<PerpTimeframe, PerpCandle[]> {
  const build = (count: number, labelFn: (i: number) => string, scale: number): PerpCandle[] => {
    const list: PerpCandle[] = [];
    let prevClose = spot * (1 - volatilityPct * 0.25 * scale);
    for (let i = 0; i < count; i++) {
      const progress = i / Math.max(1, count - 1);
      const drift = spot * (1 - volatilityPct * 0.25 * scale * (1 - progress));
      const osc =
        Math.sin(i * 0.85) * spot * volatilityPct * 0.28 * scale +
        Math.cos(i * 0.42) * spot * volatilityPct * 0.16 * scale;
      const open = i === 0 ? Math.round(prevClose * 100) / 100 : list[i - 1].close;
      const close =
        i === count - 1
          ? spot
          : Math.round((drift + osc) * 100) / 100;
      const wickSpan = Math.max(Math.abs(close - open) * 0.85, spot * volatilityPct * 0.14 * scale);
      const high = Math.round((Math.max(open, close) + wickSpan * (0.55 + (i % 3) * 0.25)) * 100) / 100;
      const low = Math.round((Math.min(open, close) - wickSpan * (0.5 + ((i + 1) % 3) * 0.22)) * 100) / 100;
      prevClose = close;

      const closes = [...list.map((c) => c.close), close];
      const avgLast = (n: number) => {
        const sl = closes.slice(-n);
        return Math.round((sl.reduce((a, b) => a + b, 0) / sl.length) * 100) / 100;
      };
      const ma7 = avgLast(7);
      const ma14 = avgLast(14);
      const ma28 = avgLast(28);
      const ema20 = ma14;

      const volume = Math.round((1800000 + Math.abs(close - open) * 650000 + (i % 5) * 420000) * scale);
      const turnoverUsd = Math.round(volume * close);
      const divYield = Math.round((baseDivYield + Math.sin(i * 0.4) * 0.06) * 100) / 100;
      list.push({
        t: labelFn(i),
        open,
        high,
        low,
        close,
        volume,
        turnoverUsd,
        ma7,
        ma14,
        ma28,
        ema20,
        divYield,
      });
    }
    return list;
  };

  return {
    "1m": build(30, (i) => `14:${String(25 + i).padStart(2, "0")}`, 0.25),
    "5m": build(30, (i) => `${145 - i * 5}m`, 0.35),
    "15m": build(30, (i) => `${7 - Math.floor(i / 4)}h ${(i % 4) * 15}m`, 0.55),
    "1h": build(30, (i) => `${String((i + 18) % 24).padStart(2, "0")}:00`, 0.85),
    "4h": build(30, (i) => `10/${String(18 + Math.floor(i / 3)).padStart(2, "0")} 01:00`, 1.15),
    "1D": build(30, (i) => `2026/10/${String(Math.max(1, i - 1)).padStart(2, "0")} 01:00`, 1.5),
    "1W": build(30, (i) => `2026/0${Math.min(9, 4 + Math.floor(i / 5))}/${String((i % 28) + 1).padStart(2, "0")}`, 2.1),
  };
}

function generateBook(mark: number, tick: number): { asks: PerpBookRow[]; bids: PerpBookRow[] } {
  const asks: PerpBookRow[] = [];
  const bids: PerpBookRow[] = [];
  for (let i = 1; i <= 7; i++) {
    const askPrice = Math.round((mark + i * tick) * 100) / 100;
    const askSize = Math.round((120 + i * 60 + (i % 2) * 80) * 10) / 10;
    asks.push({
      price: askPrice,
      size: askSize,
      totalUsd: Math.round(askPrice * askSize),
    });

    const bidPrice = Math.round((mark - i * tick) * 100) / 100;
    const bidSize = Math.round((140 + i * 75 + ((i + 1) % 2) * 90) * 10) / 10;
    bids.push({
      price: bidPrice,
      size: bidSize,
      totalUsd: Math.round(bidPrice * bidSize),
    });
  }
  return { asks, bids };
}

const DEMO_SIG = "2nhH3Wz7DTqz4aMJiCj33dQt1oYdTemsBdWYfs9SyjAJJGX5ptVhPUQyCjAxrET9YTpp1K1bVfN3Tc7DAKnyb7B2";

export const PERP_MARKETS: PerpMarket[] = [
  {
    ticker: "NVDAx-PERP",
    symbol: "NVDAx",
    name: "NVIDIA Corpor...",
    companyFull: "NVIDIA Corporation Common Stock",
    sector: "Information Technology",
    industry: "SEMICONDUCTORS & RELATED DEVICES",
    exchange: "NASDAQ",
    listingDate: "1999-01-22",
    headquarters: "2788 SAN TOMAS EXPRESSWAY, SANTA CLARA, CA",
    employees: "42,000",
    website: "https://www.nvidia.com",
    mintAddress: "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh",
    overview:
      "Nvidia is a leading developer of graphics processing units. Traditionally, GPUs were used to enhance the experience on computing platforms, most notably in gaming applications on PCs. GPU use cases have since emerged as important semiconductors used in artificial intelligence infrastructure and accelerated data centers.",
    markPrice: 217.63,
    indexPrice: 217.59,
    open24h: 219.88,
    prevClose: 217.94,
    change24hUsd: -0.30,
    change24hPct: -0.14,
    high24h: 219.19,
    low24h: 215.53,
    volume24hShares: "84.31M",
    volume24hUsd: 724750000,
    turnoverRatePct: "0.01%",
    peTtm: "27.55",
    marketCap: "5.22T",
    openInterestUsd: 18420000,
    longSkewPct: 64,
    fundingHourlyPct: 0.0048,
    dividendYieldApy: 0.46,
    dividendPerShare: "$0.25 per share held",
    dividendFrequency: "4 / Year",
    nextExDivDate: "Nov 28, 2026",
    tokenMultiplier: "1.004620x",
    maxLeverage: 25,
    sparkline: [211, 214, 219, 224, 220, 216, 218, 217.63],
    candles: generateCandles(217.63, 0.038, 0.46),
    ...generateBook(217.59, 0.03),
    recentTrades: [
      { id: "nv1", price: 217.63, size: 300, side: "LONG", time: "14:54:39", sig: DEMO_SIG },
      { id: "nv2", price: 217.58, size: 200, side: "SHORT", time: "14:54:21", sig: DEMO_SIG },
      { id: "nv3", price: 217.61, size: 450, side: "LONG", time: "14:53:58", sig: DEMO_SIG },
      { id: "nv4", price: 217.55, size: 120, side: "SHORT", time: "14:53:12", sig: DEMO_SIG },
    ],
    quarterlyFinancials: [
      { period: "Q4'25", revenueB: 39.3, netIncomeB: 22.1, assetsB: 96.0, liabilitiesB: 28.4, debtToAssetPct: 29.5 },
      { period: "Q1'26", revenueB: 43.2, netIncomeB: 19.8, assetsB: 104.5, liabilitiesB: 31.2, debtToAssetPct: 34.8 },
      { period: "Q2'26", revenueB: 46.8, netIncomeB: 24.9, assetsB: 118.2, liabilitiesB: 30.8, debtToAssetPct: 26.0 },
      { period: "Q3'26", revenueB: 54.1, netIncomeB: 31.4, assetsB: 135.0, liabilitiesB: 31.5, debtToAssetPct: 20.4 },
      { period: "Q4'26", revenueB: 63.8, netIncomeB: 38.9, assetsB: 156.4, liabilitiesB: 32.1, debtToAssetPct: 15.2 },
    ],
    annualFinancials: [
      { period: "FY22", revenueB: 26.9, netIncomeB: 9.7, assetsB: 44.1, liabilitiesB: 17.5, debtToAssetPct: 39.6 },
      { period: "FY23", revenueB: 60.9, netIncomeB: 29.7, assetsB: 65.7, liabilitiesB: 22.7, debtToAssetPct: 34.5 },
      { period: "FY24", revenueB: 130.5, netIncomeB: 72.8, assetsB: 111.6, liabilitiesB: 32.3, debtToAssetPct: 28.9 },
      { period: "FY25", revenueB: 187.1, netIncomeB: 108.4, assetsB: 142.0, liabilitiesB: 31.9, debtToAssetPct: 22.4 },
      { period: "FY26E", revenueB: 242.0, netIncomeB: 144.2, assetsB: 178.5, liabilitiesB: 30.4, debtToAssetPct: 17.0 },
    ],
  },
  {
    ticker: "AAPLx-PERP",
    symbol: "AAPLx",
    name: "Apple Inc...",
    companyFull: "Apple Inc. Common Stock",
    sector: "Information Technology",
    industry: "COMPUTERS, PHONES & HOUSEHOLD ELECTRONICS",
    exchange: "NASDAQ",
    listingDate: "1980-12-12",
    headquarters: "ONE APPLE PARK WAY, CUPERTINO, CA",
    employees: "164,000",
    website: "https://www.apple.com",
    mintAddress: "XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp",
    overview:
      "Apple Inc. designs, manufactures, and markets smartphones, personal computers, tablets, wearables, and accessories worldwide, alongside its high-margin iOS ecosystem and Apple Intelligence services.",
    markPrice: 345.24,
    indexPrice: 345.18,
    open24h: 347.10,
    prevClose: 347.11,
    change24hUsd: -1.87,
    change24hPct: -0.54,
    high24h: 348.40,
    low24h: 343.80,
    volume24hShares: "51.20M",
    volume24hUsd: 492100000,
    turnoverRatePct: "0.02%",
    peTtm: "31.40",
    marketCap: "5.02T",
    openInterestUsd: 14200000,
    longSkewPct: 56,
    fundingHourlyPct: 0.0031,
    dividendYieldApy: 0.52,
    dividendPerShare: "$0.26 per share held",
    dividendFrequency: "4 / Year",
    nextExDivDate: "Nov 14, 2026",
    tokenMultiplier: "1.012840x",
    maxLeverage: 20,
    sparkline: [348, 347, 346.5, 346, 345.8, 345.5, 345.3, 345.24],
    candles: generateCandles(345.24, 0.02, 0.52),
    ...generateBook(345.24, 0.05),
    recentTrades: [
      { id: "ap1", price: 345.24, size: 150, side: "LONG", time: "14:54:12", sig: DEMO_SIG },
      { id: "ap2", price: 345.19, size: 90, side: "SHORT", time: "14:53:40", sig: DEMO_SIG },
    ],
    quarterlyFinancials: [
      { period: "Q4'25", revenueB: 94.9, netIncomeB: 24.7, assetsB: 364.9, liabilitiesB: 308.0, debtToAssetPct: 84.4 },
      { period: "Q1'26", revenueB: 124.3, netIncomeB: 36.3, assetsB: 372.1, liabilitiesB: 301.2, debtToAssetPct: 80.9 },
      { period: "Q2'26", revenueB: 95.4, netIncomeB: 25.2, assetsB: 368.4, liabilitiesB: 294.5, debtToAssetPct: 79.9 },
      { period: "Q3'26", revenueB: 91.8, netIncomeB: 23.9, assetsB: 375.0, liabilitiesB: 292.1, debtToAssetPct: 77.8 },
      { period: "Q4'26", revenueB: 102.6, netIncomeB: 28.4, assetsB: 386.2, liabilitiesB: 290.4, debtToAssetPct: 75.1 },
    ],
    annualFinancials: [
      { period: "FY22", revenueB: 394.3, netIncomeB: 99.8, assetsB: 352.7, liabilitiesB: 302.0, debtToAssetPct: 85.6 },
      { period: "FY23", revenueB: 383.2, netIncomeB: 96.9, assetsB: 352.5, liabilitiesB: 290.4, debtToAssetPct: 82.3 },
      { period: "FY24", revenueB: 391.0, netIncomeB: 93.7, assetsB: 364.9, liabilitiesB: 308.0, debtToAssetPct: 84.4 },
      { period: "FY25", revenueB: 408.5, netIncomeB: 104.2, assetsB: 376.0, liabilitiesB: 296.5, debtToAssetPct: 78.8 },
      { period: "FY26E", revenueB: 429.1, netIncomeB: 113.8, assetsB: 389.0, liabilitiesB: 288.0, debtToAssetPct: 74.0 },
    ],
  },
  {
    ticker: "MSFTx-PERP",
    symbol: "MSFTx",
    name: "Microsoft...",
    companyFull: "Microsoft Corporation Common Stock",
    sector: "Information Technology",
    industry: "ENTERPRISE CLOUD & SOFTWARE",
    exchange: "NASDAQ",
    listingDate: "1986-03-13",
    headquarters: "ONE MICROSOFT WAY, REDMOND, WA",
    employees: "228,000",
    website: "https://www.microsoft.com",
    mintAddress: "XspzcW1PRtgf6Wj92HCiZdjzKCyFekVD8P5Ueh3dRMX",
    overview:
      "Microsoft Corporation develops and supports software, services, devices, and cloud solutions worldwide, led by Azure AI infrastructure, Office 365 commercial productivity, and GitHub Copilot.",
    markPrice: 530.20,
    indexPrice: 530.12,
    open24h: 531.40,
    prevClose: 531.32,
    change24hUsd: -1.12,
    change24hPct: -0.21,
    high24h: 534.00,
    low24h: 527.80,
    volume24hShares: "24.15M",
    volume24hUsd: 389000000,
    turnoverRatePct: "0.01%",
    peTtm: "33.10",
    marketCap: "3.95T",
    openInterestUsd: 11800000,
    longSkewPct: 61,
    fundingHourlyPct: 0.0038,
    dividendYieldApy: 0.78,
    dividendPerShare: "$0.83 per share held",
    dividendFrequency: "4 / Year",
    nextExDivDate: "Nov 20, 2026",
    tokenMultiplier: "1.018900x",
    maxLeverage: 20,
    sparkline: [531, 532, 530.8, 531.5, 529.9, 530.4, 530.1, 530.2],
    candles: generateCandles(530.20, 0.021, 0.78),
    ...generateBook(530.20, 0.10),
    recentTrades: [
      { id: "ms1", price: 530.20, size: 85, side: "LONG", time: "14:53:48", sig: DEMO_SIG },
    ],
    quarterlyFinancials: [
      { period: "Q4'25", revenueB: 69.6, netIncomeB: 24.1, assetsB: 512.1, liabilitiesB: 243.6, debtToAssetPct: 47.5 },
      { period: "Q1'26", revenueB: 72.4, netIncomeB: 25.8, assetsB: 528.0, liabilitiesB: 241.0, debtToAssetPct: 45.6 },
      { period: "Q2'26", revenueB: 75.1, netIncomeB: 27.2, assetsB: 544.5, liabilitiesB: 239.2, debtToAssetPct: 43.9 },
      { period: "Q3'26", revenueB: 78.9, netIncomeB: 29.1, assetsB: 562.0, liabilitiesB: 236.8, debtToAssetPct: 42.1 },
      { period: "Q4'26", revenueB: 83.2, netIncomeB: 31.4, assetsB: 584.0, liabilitiesB: 234.0, debtToAssetPct: 40.0 },
    ],
    annualFinancials: [
      { period: "FY22", revenueB: 198.2, netIncomeB: 72.7, assetsB: 364.8, liabilitiesB: 198.2, debtToAssetPct: 54.3 },
      { period: "FY23", revenueB: 211.9, netIncomeB: 72.3, assetsB: 411.9, liabilitiesB: 205.7, debtToAssetPct: 49.9 },
      { period: "FY24", revenueB: 245.1, netIncomeB: 88.1, assetsB: 512.1, liabilitiesB: 243.6, debtToAssetPct: 47.5 },
      { period: "FY25", revenueB: 279.0, netIncomeB: 101.4, assetsB: 548.0, liabilitiesB: 239.0, debtToAssetPct: 43.6 },
      { period: "FY26E", revenueB: 314.5, netIncomeB: 116.2, assetsB: 584.0, liabilitiesB: 234.0, debtToAssetPct: 40.0 },
    ],
  },
  {
    ticker: "GOOGLx-PERP",
    symbol: "GOOGLx",
    name: "Alphabet...",
    companyFull: "Alphabet Inc. Class A Common Stock",
    sector: "Communication Services",
    industry: "INTERNET SEARCH, CLOUD & AI",
    exchange: "NASDAQ",
    listingDate: "2004-08-19",
    headquarters: "1600 AMPHITHEATRE PARKWAY, MOUNTAIN VIEW, CA",
    employees: "182,500",
    website: "https://abc.xyz",
    mintAddress: "XsCPL9dNWBMvFtTmwcCA5v3xWPSMEBCszbQdiLLq6aN",
    overview:
      "Alphabet Inc. offers search, YouTube video, Android, Google Cloud infrastructure, and Gemini AI models globally.",
    markPrice: 323.87,
    indexPrice: 323.80,
    open24h: 320.55,
    prevClose: 320.56,
    change24hUsd: 3.31,
    change24hPct: 1.03,
    high24h: 325.40,
    low24h: 319.80,
    volume24hShares: "31.40M",
    volume24hUsd: 312000000,
    turnoverRatePct: "0.01%",
    peTtm: "24.80",
    marketCap: "3.87T",
    openInterestUsd: 9800000,
    longSkewPct: 59,
    fundingHourlyPct: 0.0032,
    dividendYieldApy: 0.45,
    dividendPerShare: "$0.22 per share held",
    dividendFrequency: "4 / Year",
    nextExDivDate: "Dec 09, 2026",
    tokenMultiplier: "1.008400x",
    maxLeverage: 20,
    sparkline: [320, 321, 321.5, 322, 322.8, 323.1, 323.5, 323.87],
    candles: generateCandles(323.87, 0.022, 0.45),
    ...generateBook(323.87, 0.06),
    recentTrades: [
      { id: "gg1", price: 323.87, size: 110, side: "LONG", time: "14:52:18", sig: DEMO_SIG },
    ],
    quarterlyFinancials: [
      { period: "Q4'25", revenueB: 96.5, netIncomeB: 26.5, assetsB: 450.2, liabilitiesB: 125.1, debtToAssetPct: 27.8 },
      { period: "Q1'26", revenueB: 90.2, netIncomeB: 24.8, assetsB: 462.0, liabilitiesB: 123.4, debtToAssetPct: 26.7 },
      { period: "Q2'26", revenueB: 94.7, netIncomeB: 26.9, assetsB: 475.8, liabilitiesB: 122.0, debtToAssetPct: 25.6 },
      { period: "Q3'26", revenueB: 99.1, netIncomeB: 28.4, assetsB: 491.0, liabilitiesB: 120.5, debtToAssetPct: 24.5 },
      { period: "Q4'26", revenueB: 106.4, netIncomeB: 31.2, assetsB: 510.4, liabilitiesB: 119.0, debtToAssetPct: 23.3 },
    ],
    annualFinancials: [
      { period: "FY22", revenueB: 282.8, netIncomeB: 59.9, assetsB: 365.2, liabilitiesB: 109.1, debtToAssetPct: 29.8 },
      { period: "FY23", revenueB: 307.3, netIncomeB: 73.7, assetsB: 402.3, liabilitiesB: 119.0, debtToAssetPct: 29.5 },
      { period: "FY24", revenueB: 350.0, netIncomeB: 100.1, assetsB: 450.2, liabilitiesB: 125.1, debtToAssetPct: 27.8 },
      { period: "FY25", revenueB: 382.4, netIncomeB: 111.0, assetsB: 482.0, liabilitiesB: 121.0, debtToAssetPct: 25.1 },
      { period: "FY26E", revenueB: 416.0, netIncomeB: 122.5, assetsB: 510.4, liabilitiesB: 119.0, debtToAssetPct: 23.3 },
    ],
  },
  {
    ticker: "AMZNx-PERP",
    symbol: "AMZNx",
    name: "Amazon....",
    companyFull: "Amazon.com, Inc. Common Stock",
    sector: "Consumer Discretionary & Cloud",
    industry: "E-COMMERCE & AWS CLOUD SERVICES",
    exchange: "NASDAQ",
    listingDate: "1997-05-15",
    headquarters: "410 TERRY AVENUE NORTH, SEATTLE, WA",
    employees: "1,525,000",
    website: "https://www.amazon.com",
    mintAddress: "Xs3eBt7uRfJX8QUs4suhyU8p2M6DoUDrJyWBa8LLZsg",
    overview:
      "Amazon.com, Inc. engages in retail sale of consumer products, advertising, and subscriptions while operating Amazon Web Services (AWS), the world's largest cloud infrastructure platform.",
    markPrice: 253.19,
    indexPrice: 253.14,
    open24h: 253.08,
    prevClose: 253.09,
    change24hUsd: 0.10,
    change24hPct: 0.04,
    high24h: 255.10,
    low24h: 251.40,
    volume24hShares: "39.80M",
    volume24hUsd: 295000000,
    turnoverRatePct: "0.01%",
    peTtm: "38.20",
    marketCap: "2.69T",
    openInterestUsd: 8900000,
    longSkewPct: 57,
    fundingHourlyPct: 0.0029,
    dividendYieldApy: 0.00,
    dividendPerShare: "$0.00 (Growth reinvestment)",
    dividendFrequency: "0 / Year",
    nextExDivDate: "TBA",
    tokenMultiplier: "1.000000x",
    maxLeverage: 20,
    sparkline: [252, 252.5, 253, 252.8, 253.1, 253.0, 253.15, 253.19],
    candles: generateCandles(253.19, 0.024, 0.0),
    ...generateBook(253.19, 0.05),
    recentTrades: [],
    quarterlyFinancials: [
      { period: "Q4'25", revenueB: 187.8, netIncomeB: 20.0, assetsB: 624.8, liabilitiesB: 338.9, debtToAssetPct: 54.2 },
      { period: "Q1'26", revenueB: 158.9, netIncomeB: 16.4, assetsB: 640.0, liabilitiesB: 334.0, debtToAssetPct: 52.1 },
      { period: "Q2'26", revenueB: 167.2, netIncomeB: 18.1, assetsB: 658.4, liabilitiesB: 330.2, debtToAssetPct: 50.1 },
      { period: "Q3'26", revenueB: 175.6, netIncomeB: 19.8, assetsB: 679.0, liabilitiesB: 326.5, debtToAssetPct: 48.0 },
      { period: "Q4'26", revenueB: 204.5, netIncomeB: 24.2, assetsB: 702.0, liabilitiesB: 322.0, debtToAssetPct: 45.8 },
    ],
    annualFinancials: [
      { period: "FY22", revenueB: 513.9, netIncomeB: -2.7, assetsB: 462.6, liabilitiesB: 316.6, debtToAssetPct: 68.4 },
      { period: "FY23", revenueB: 574.7, netIncomeB: 30.4, assetsB: 527.8, liabilitiesB: 325.9, debtToAssetPct: 61.7 },
      { period: "FY24", revenueB: 637.9, netIncomeB: 59.2, assetsB: 624.8, liabilitiesB: 338.9, debtToAssetPct: 54.2 },
      { period: "FY25", revenueB: 691.0, netIncomeB: 71.5, assetsB: 668.0, liabilitiesB: 330.0, debtToAssetPct: 49.4 },
      { period: "FY26E", revenueB: 748.2, netIncomeB: 84.5, assetsB: 702.0, liabilitiesB: 322.0, debtToAssetPct: 45.8 },
    ],
  },
  {
    ticker: "SPYx-PERP",
    symbol: "SPYx",
    name: "S&P 500 ETF...",
    companyFull: "SPDR S&P 500 ETF Trust (Tokenized xStock)",
    sector: "US Benchmark Index ETF",
    industry: "BROAD MARKET LARGE-CAP EQUITIES",
    exchange: "NYSE ARCA",
    listingDate: "1993-01-22",
    headquarters: "ONE CONGRESS STREET, BOSTON, MA",
    employees: "500 Index Constituents",
    website: "https://www.ssga.com",
    mintAddress: "XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W",
    overview:
      "SPYx tracks the price and dividend yield performance of the S&P 500 Index, representing 500 of the largest publicly traded US corporations with automatic Solana Token-2022 dividend multiplier accrual.",
    markPrice: 584.42,
    indexPrice: 584.18,
    open24h: 573.85,
    prevClose: 573.86,
    change24hUsd: 10.56,
    change24hPct: 1.84,
    high24h: 589.10,
    low24h: 573.60,
    volume24hShares: "42.18M",
    volume24hUsd: 482000000,
    turnoverRatePct: "0.03%",
    peTtm: "26.40",
    marketCap: "640.5B",
    openInterestUsd: 19400000,
    longSkewPct: 58,
    fundingHourlyPct: 0.0042,
    dividendYieldApy: 1.42,
    dividendPerShare: "$1.89 per share held",
    dividendFrequency: "4 / Year",
    nextExDivDate: "Dec 18, 2026",
    tokenMultiplier: "1.034210x",
    maxLeverage: 25,
    sparkline: [574, 576, 575, 579, 581, 580, 583, 584.42],
    candles: generateCandles(584.42, 0.022, 1.42),
    ...generateBook(584.42, 0.10),
    recentTrades: [
      { id: "pt1", price: 584.42, size: 125, side: "LONG", time: "14:54:44", sig: DEMO_SIG },
      { id: "pt2", price: 584.35, size: 48, side: "SHORT", time: "14:54:19", sig: DEMO_SIG },
    ],
    quarterlyFinancials: [
      { period: "Q4'25", revenueB: 412.0, netIncomeB: 84.5, assetsB: 1620.0, liabilitiesB: 640.0, debtToAssetPct: 39.5 },
      { period: "Q1'26", revenueB: 425.0, netIncomeB: 88.2, assetsB: 1680.0, liabilitiesB: 635.0, debtToAssetPct: 37.8 },
      { period: "Q2'26", revenueB: 438.5, netIncomeB: 92.4, assetsB: 1740.0, liabilitiesB: 630.0, debtToAssetPct: 36.2 },
      { period: "Q3'26", revenueB: 454.0, netIncomeB: 97.1, assetsB: 1810.0, liabilitiesB: 625.0, debtToAssetPct: 34.5 },
      { period: "Q4'26", revenueB: 472.0, netIncomeB: 103.5, assetsB: 1890.0, liabilitiesB: 620.0, debtToAssetPct: 32.8 },
    ],
    annualFinancials: [
      { period: "FY22", revenueB: 1480.0, netIncomeB: 280.0, assetsB: 1380.0, liabilitiesB: 660.0, debtToAssetPct: 47.8 },
      { period: "FY23", revenueB: 1560.0, netIncomeB: 305.0, assetsB: 1460.0, liabilitiesB: 650.0, debtToAssetPct: 44.5 },
      { period: "FY24", revenueB: 1650.0, netIncomeB: 334.0, assetsB: 1580.0, liabilitiesB: 642.0, debtToAssetPct: 40.6 },
      { period: "FY25", revenueB: 1760.0, netIncomeB: 368.0, assetsB: 1710.0, liabilitiesB: 632.0, debtToAssetPct: 36.9 },
      { period: "FY26E", revenueB: 1880.0, netIncomeB: 405.0, assetsB: 1890.0, liabilitiesB: 620.0, debtToAssetPct: 32.8 },
    ],
  },
  {
    ticker: "METAx-PERP",
    symbol: "METAx",
    name: "Meta Plat...",
    companyFull: "Meta Platforms, Inc. Class A Common Stock",
    sector: "Communication Services",
    industry: "SOCIAL PLATFORMS & AI INFRASTRUCTURE",
    exchange: "NASDAQ",
    listingDate: "2012-05-18",
    headquarters: "1 META WAY, MENLO PARK, CA",
    employees: "72,400",
    website: "https://investor.fb.com",
    mintAddress: "Xsa62P5mvPszXL1krVUnU5ar38bBSVcWAB6fmPCo5Zu",
    overview:
      "Meta Platforms, Inc. builds social networking applications (Facebook, Instagram, WhatsApp) and open-weights Llama AI models alongside augmented and virtual reality hardware.",
    markPrice: 615.25,
    indexPrice: 615.10,
    open24h: 618.40,
    prevClose: 618.42,
    change24hUsd: -3.17,
    change24hPct: -0.51,
    high24h: 621.00,
    low24h: 611.20,
    volume24hShares: "16.80M",
    volume24hUsd: 268000000,
    turnoverRatePct: "0.01%",
    peTtm: "25.90",
    marketCap: "1.56T",
    openInterestUsd: 8400000,
    longSkewPct: 57,
    fundingHourlyPct: 0.0045,
    dividendYieldApy: 0.36,
    dividendPerShare: "$0.52 per share held",
    dividendFrequency: "4 / Year",
    nextExDivDate: "Dec 15, 2026",
    tokenMultiplier: "1.007200x",
    maxLeverage: 20,
    sparkline: [619, 618, 617.5, 616, 617, 616.2, 615.8, 615.25],
    candles: generateCandles(615.25, 0.028, 0.36),
    ...generateBook(615.25, 0.15),
    recentTrades: [],
    quarterlyFinancials: [
      { period: "Q4'25", revenueB: 48.4, netIncomeB: 20.8, assetsB: 276.0, liabilitiesB: 93.4, debtToAssetPct: 33.8 },
      { period: "Q1'26", revenueB: 42.3, netIncomeB: 16.9, assetsB: 284.5, liabilitiesB: 92.1, debtToAssetPct: 32.3 },
      { period: "Q2'26", revenueB: 45.8, netIncomeB: 18.6, assetsB: 295.0, liabilitiesB: 90.8, debtToAssetPct: 30.7 },
      { period: "Q3'26", revenueB: 49.2, netIncomeB: 20.4, assetsB: 308.0, liabilitiesB: 89.5, debtToAssetPct: 29.0 },
      { period: "Q4'26", revenueB: 54.6, netIncomeB: 23.5, assetsB: 324.0, liabilitiesB: 88.0, debtToAssetPct: 27.1 },
    ],
    annualFinancials: [
      { period: "FY22", revenueB: 116.6, netIncomeB: 23.2, assetsB: 185.7, liabilitiesB: 60.0, debtToAssetPct: 32.3 },
      { period: "FY23", revenueB: 134.9, netIncomeB: 39.1, assetsB: 229.6, liabilitiesB: 76.4, debtToAssetPct: 33.2 },
      { period: "FY24", revenueB: 164.5, netIncomeB: 62.4, assetsB: 276.0, liabilitiesB: 93.4, debtToAssetPct: 33.8 },
      { period: "FY25", revenueB: 185.0, netIncomeB: 72.1, assetsB: 301.0, liabilitiesB: 90.0, debtToAssetPct: 29.9 },
      { period: "FY26E", revenueB: 206.4, netIncomeB: 82.8, assetsB: 324.0, liabilitiesB: 88.0, debtToAssetPct: 27.1 },
    ],
  },
  {
    ticker: "TSLAx-PERP",
    symbol: "TSLAx",
    name: "Tesla Inc...",
    companyFull: "Tesla, Inc. Common Stock",
    sector: "Consumer Discretionary",
    industry: "ELECTRIC VEHICLES, AUTONOMY & ENERGY",
    exchange: "NASDAQ",
    listingDate: "2010-06-29",
    headquarters: "1 TESLA ROAD, AUSTIN, TX",
    employees: "140,473",
    website: "https://www.tesla.com",
    mintAddress: "XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB",
    overview:
      "Tesla, Inc. designs, manufactures, and sells electric vehicles, Full Self-Driving (FSD) neural autonomy software, humanoid robotics, and grid-scale Megapack energy storage.",
    markPrice: 262.40,
    indexPrice: 262.15,
    open24h: 268.14,
    prevClose: 268.15,
    change24hUsd: -5.75,
    change24hPct: -2.14,
    high24h: 271.00,
    low24h: 258.50,
    volume24hShares: "68.90M",
    volume24hUsd: 645000000,
    turnoverRatePct: "0.03%",
    peTtm: "64.20",
    marketCap: "842.0B",
    openInterestUsd: 16200000,
    longSkewPct: 47,
    fundingHourlyPct: -0.0024,
    dividendYieldApy: 0.00,
    dividendPerShare: "$0.00 per share held",
    dividendFrequency: "0 / Year",
    nextExDivDate: "TBA",
    tokenMultiplier: "1.000000x",
    maxLeverage: 20,
    sparkline: [269, 268, 266, 267, 265, 264, 263, 262.4],
    candles: generateCandles(262.40, 0.042, 0.0),
    ...generateBook(262.40, 0.08),
    recentTrades: [
      { id: "ts1", price: 262.40, size: 300, side: "SHORT", time: "14:54:38", sig: DEMO_SIG },
      { id: "ts2", price: 262.55, size: 140, side: "LONG", time: "14:53:19", sig: DEMO_SIG },
    ],
    quarterlyFinancials: [
      { period: "Q4'25", revenueB: 25.7, netIncomeB: 2.3, assetsB: 122.1, liabilitiesB: 48.4, debtToAssetPct: 39.6 },
      { period: "Q1'26", revenueB: 23.4, netIncomeB: 1.9, assetsB: 126.5, liabilitiesB: 47.9, debtToAssetPct: 37.8 },
      { period: "Q2'26", revenueB: 26.8, netIncomeB: 2.6, assetsB: 132.0, liabilitiesB: 47.1, debtToAssetPct: 35.6 },
      { period: "Q3'26", revenueB: 28.9, netIncomeB: 3.1, assetsB: 138.4, liabilitiesB: 46.5, debtToAssetPct: 33.5 },
      { period: "Q4'26", revenueB: 31.5, netIncomeB: 3.8, assetsB: 146.0, liabilitiesB: 45.8, debtToAssetPct: 31.3 },
    ],
    annualFinancials: [
      { period: "FY22", revenueB: 81.4, netIncomeB: 12.5, assetsB: 82.3, liabilitiesB: 36.4, debtToAssetPct: 44.2 },
      { period: "FY23", revenueB: 96.7, netIncomeB: 14.9, assetsB: 106.6, liabilitiesB: 43.0, debtToAssetPct: 40.3 },
      { period: "FY24", revenueB: 97.7, netIncomeB: 7.1, assetsB: 122.1, liabilitiesB: 48.4, debtToAssetPct: 39.6 },
      { period: "FY25", revenueB: 108.4, netIncomeB: 9.8, assetsB: 134.0, liabilitiesB: 47.0, debtToAssetPct: 35.0 },
      { period: "FY26E", revenueB: 121.0, netIncomeB: 12.9, assetsB: 146.0, liabilitiesB: 45.8, debtToAssetPct: 31.3 },
    ],
  },
  {
    ticker: "QQQx-PERP",
    symbol: "QQQx",
    name: "Nasdaq 100...",
    companyFull: "Invesco QQQ Trust Series 1 (Tokenized xStock)",
    sector: "Tech Growth Index ETF",
    industry: "NASDAQ-100 NON-FINANCIAL EQUITIES",
    exchange: "NASDAQ",
    listingDate: "1999-03-10",
    headquarters: "1331 SPRING STREET NW, ATLANTA, GA",
    employees: "100 Index Constituents",
    website: "https://www.invesco.com",
    mintAddress: "Xs8S1uUs1zvS2p7iwtsG3b6fkhpvmwz4GYU3gWAmWHZ",
    overview:
      "QQQx tracks the Nasdaq-100 Index of 100 of the largest domestic and international non-financial companies listed on the Nasdaq Stock Market.",
    markPrice: 504.90,
    indexPrice: 504.70,
    open24h: 494.42,
    prevClose: 494.41,
    change24hUsd: 10.49,
    change24hPct: 2.12,
    high24h: 509.40,
    low24h: 494.20,
    volume24hShares: "28.40M",
    volume24hUsd: 419000000,
    turnoverRatePct: "0.02%",
    peTtm: "32.10",
    marketCap: "312.0B",
    openInterestUsd: 12400000,
    longSkewPct: 60,
    fundingHourlyPct: 0.0049,
    dividendYieldApy: 0.62,
    dividendPerShare: "$0.78 per share held",
    dividendFrequency: "4 / Year",
    nextExDivDate: "Dec 21, 2026",
    tokenMultiplier: "1.015400x",
    maxLeverage: 20,
    sparkline: [495, 497, 498, 500, 501, 503, 504, 504.9],
    candles: generateCandles(504.90, 0.024, 0.62),
    ...generateBook(504.90, 0.10),
    recentTrades: [],
    quarterlyFinancials: [
      { period: "Q4'25", revenueB: 245.0, netIncomeB: 68.0, assetsB: 980.0, liabilitiesB: 320.0, debtToAssetPct: 32.6 },
      { period: "Q1'26", revenueB: 256.0, netIncomeB: 71.5, assetsB: 1020.0, liabilitiesB: 318.0, debtToAssetPct: 31.1 },
      { period: "Q2'26", revenueB: 268.0, netIncomeB: 75.8, assetsB: 1065.0, liabilitiesB: 315.0, debtToAssetPct: 29.5 },
      { period: "Q3'26", revenueB: 281.0, netIncomeB: 80.2, assetsB: 1110.0, liabilitiesB: 312.0, debtToAssetPct: 28.1 },
      { period: "Q4'26", revenueB: 296.0, netIncomeB: 85.4, assetsB: 1160.0, liabilitiesB: 309.0, debtToAssetPct: 26.6 },
    ],
    annualFinancials: [
      { period: "FY22", revenueB: 860.0, netIncomeB: 210.0, assetsB: 820.0, liabilitiesB: 330.0, debtToAssetPct: 40.2 },
      { period: "FY23", revenueB: 920.0, netIncomeB: 238.0, assetsB: 890.0, liabilitiesB: 326.0, debtToAssetPct: 36.6 },
      { period: "FY24", revenueB: 990.0, netIncomeB: 268.0, assetsB: 980.0, liabilitiesB: 320.0, debtToAssetPct: 32.6 },
      { period: "FY25", revenueB: 1075.0, netIncomeB: 299.0, assetsB: 1080.0, liabilitiesB: 314.0, debtToAssetPct: 29.0 },
      { period: "FY26E", revenueB: 1165.0, netIncomeB: 332.0, assetsB: 1160.0, liabilitiesB: 309.0, debtToAssetPct: 26.6 },
    ],
  },
];

export interface UserPerpPosition {
  id: string;
  ticker: string;
  symbol: string;
  side: "LONG" | "SHORT";
  collateralUsd: number;
  leverage: number;
  sizeUsd: number;
  sizeUnits: number;
  entryPrice: number;
  liqPrice: number;
  takeProfit?: number;
  stopLoss?: number;
  openedAt: number;
  sig: string;
}

const PERP_POS_KEY = "coupon.perps.positions.v2";

const DEFAULT_POSITIONS: UserPerpPosition[] = [];

export function loadPerpPositions(): UserPerpPosition[] {
  if (typeof window === "undefined") return DEFAULT_POSITIONS;
  try {
    const raw = localStorage.getItem(PERP_POS_KEY);
    if (!raw) return DEFAULT_POSITIONS;
    return JSON.parse(raw) as UserPerpPosition[];
  } catch {
    return DEFAULT_POSITIONS;
  }
}

export function savePerpPositions(list: UserPerpPosition[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(PERP_POS_KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
}
