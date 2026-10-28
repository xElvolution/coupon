export interface MarketDef {
  x: string; // xStock ticker
  under: string; // underlying ticker
  name: string;
  mint: string;
  equityFeed: string;
  xFeed: string;
  rrFeed: string;
  equityFeedSymbol: string;
  xFeedSymbol: string;
  rrFeedSymbol: string;
  nextExDate: string;
  quarterlyBpsEst: number; // estimated quarterly dividend step in bps
  hue: string;
}

export const MARKETS: MarketDef[] = [
  {
    x: "SPYx",
    under: "SPY",
    name: "S&P 500",
    mint: "XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W",
    equityFeed: "19e09bb805456ada3979a7d1cbb4b6d63babc3a0f8e8a9509f68afa5c4c11cd5",
    xFeed: "2817b78438c769357182c04346fddaad1178c82f4048828fe0997c3c64624e14",
    rrFeed: "9e916cc00d292da2367646ffd6537d6b8d0c3f15e2d5891ac44aed31291811a9",
    equityFeedSymbol: "Equity.US.SPY/USD",
    xFeedSymbol: "Crypto.SPYX/USD",
    rrFeedSymbol: "Crypto.SPYX/SPY.RR",
    nextExDate: "2026-12-18",
    quarterlyBpsEst: 18.0,
    hue: "#1F5C45",
  },
  {
    x: "MSFTx",
    under: "MSFT",
    name: "Microsoft",
    mint: "XspzcW1PRtgf6Wj92HCiZdjzKCyFekVD8P5Ueh3dRMX",
    equityFeed: "d0ca23c1cc005e004ccf1db5bf76aeb6a49218f43dac3d4b275e92de12ded4d1",
    xFeed: "bb723a70af731ab56b9a650eb7e8ac22b7bc07ea77f8670bd1fa9a37bf6df3f5",
    rrFeed: "fbc60d2549711c0fc72da0c9f6971170d4592c2fbd1e9780dc52464316225acc",
    equityFeedSymbol: "Equity.US.MSFT/USD",
    xFeedSymbol: "Crypto.MSFTX/USD",
    rrFeedSymbol: "Crypto.MSFTX/MSFT.RR",
    nextExDate: "2026-11-19",
    quarterlyBpsEst: 18.5,
    hue: "#2B4C7E",
  },
  {
    x: "QQQx",
    under: "QQQ",
    name: "Nasdaq 100",
    mint: "Xs8S1uUs1zvS2p7iwtsG3b6fkhpvmwz4GYU3gWAmWHZ",
    equityFeed: "9695e2b96ea7b3859da9ed25b7a46a920a776e2fdae19a7bcfdf2b219230452d",
    xFeed: "178a6f73a5aede9d0d682e86b0047c9f333ed0efe5c6537ca937565219c4054d",
    rrFeed: "5fe0ad9fd9bd888bbdfb609dbe8a6233248fa3dee25755f986f473c43938c7ca",
    equityFeedSymbol: "Equity.US.QQQ/USD",
    xFeedSymbol: "Crypto.QQQX/USD",
    rrFeedSymbol: "Crypto.QQQX/QQQ.RR",
    nextExDate: "2026-12-21",
    quarterlyBpsEst: 13.5,
    hue: "#6B3FA0",
  },
  {
    x: "AAPLx",
    under: "AAPL",
    name: "Apple",
    mint: "XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp",
    equityFeed: "49f6b65cb1de6b10eaf75e7c03ca029c306d0357e91b5311b175084a5ad55688",
    xFeed: "978e6cc68a119ce066aa830017318563a9ed04ec3a0a6439010fc11296a58675",
    rrFeed: "25babb83691a056fd65f879bfd7197eabd840aae741f69c87ccb31e204a979b2",
    equityFeedSymbol: "Equity.US.AAPL/USD",
    xFeedSymbol: "Crypto.AAPLX/USD",
    rrFeedSymbol: "Crypto.AAPLX/AAPL.RR",
    nextExDate: "2026-11-12",
    quarterlyBpsEst: 11.2,
    hue: "#3A3A3A",
  },
  {
    x: "METAx",
    under: "META",
    name: "Meta",
    mint: "Xsa62P5mvPszXL1krVUnU5ar38bBSVcWAB6fmPCo5Zu",
    equityFeed: "78a3e3b8e676a8f73c439f5d749737034b139bbbe899ba5775216fba596607fe",
    xFeed: "bf3e5871be3f80ab7a4d1f1fd039145179fb58569e159aee1ccd472868ea5900",
    rrFeed: "dfeda47e0d3ed1db00062c9ae8b82f5d0d9699f772e7fee1bfd4e9b1dd168574",
    equityFeedSymbol: "Equity.US.META/USD",
    xFeedSymbol: "Crypto.METAX/USD",
    rrFeedSymbol: "Crypto.METAX/META.RR",
    nextExDate: "2026-12-15",
    quarterlyBpsEst: 8.5,
    hue: "#1C63C9",
  },
  {
    x: "GOOGLx",
    under: "GOOGL",
    name: "Alphabet",
    mint: "XsCPL9dNWBMvFtTmwcCA5v3xWPSMEBCszbQdiLLq6aN",
    equityFeed: "5a48c03e9b9cb337801073ed9d166817473697efff0d138874e0f6a33d6d5aa6",
    xFeed: "b911b0329028cd0283e4259c33809d62942bd2716a58084e5f31d64c00b5424e",
    rrFeed: "d54f066daee8cfbee2ecbefc8faa351c7c38b2c2a7cd8b704af20875974e3c68",
    equityFeedSymbol: "Equity.US.GOOGL/USD",
    xFeedSymbol: "Crypto.GOOGLX/USD",
    rrFeedSymbol: "Crypto.GOOGLX/GOOGL.RR",
    nextExDate: "2026-12-09",
    quarterlyBpsEst: 9.6,
    hue: "#B8452F",
  },
  {
    x: "NVDAx",
    under: "NVDA",
    name: "NVIDIA",
    mint: "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh",
    equityFeed: "b1073854ed24cbc755dc527418f52b7d271f6cc967bbf8d8129112b18860a593",
    xFeed: "4244d07890e4610f46bbde67de8f43a4bf8b569eebe904f136b469f148503b7f",
    rrFeed: "b675c4e9f46d94afa9174a7df09966b77a2950970bb50a77ec8ad4fcfd8266f4",
    equityFeedSymbol: "Equity.US.NVDA/USD",
    xFeedSymbol: "Crypto.NVDAX/USD",
    rrFeedSymbol: "Crypto.NVDAX/NVDA.RR",
    nextExDate: "2026-12-04",
    quarterlyBpsEst: 2.3,
    hue: "#4E7A1E",
  },
  {
    x: "TSLAx",
    under: "TSLA",
    name: "Tesla",
    mint: "XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB",
    equityFeed: "16dad506d7db8da01c87581c87ca897a012a153557d4d578c3b9c9e1bc0632f1",
    xFeed: "47a156470288850a440df3a6ce85a55917b813a19bb5b31128a33a986566a362",
    rrFeed: "997362625415627e9e3177f6c0d32f200d4a221ccadb3dddab80d6079d03ea24",
    equityFeedSymbol: "Equity.US.TSLA/USD",
    xFeedSymbol: "Crypto.TSLAX/USD",
    rrFeedSymbol: "Crypto.TSLAX/TSLA.RR",
    nextExDate: "None",
    quarterlyBpsEst: 0,
    hue: "#A8322D",
  },
  {
    x: "AMZNx",
    under: "AMZN",
    name: "Amazon",
    mint: "Xs3eBt7uRfJX8QUs4suhyU8p2M6DoUDrJyWBa8LLZsg",
    equityFeed: "b5d0e0fa58a1f8b81498ae670ce93c872d14434b72c364885d4fa1b257cbb07a",
    xFeed: "7148fbe6e493ff2580305c92a8d7f8628c9943b11b9b253aebc24863fec290e8",
    rrFeed: "0ed9040c3fcdadf6ab2f1815f6b252e4c1ca5fd55108390f4acd52a7efac13dd",
    equityFeedSymbol: "Equity.US.AMZN/USD",
    xFeedSymbol: "Crypto.AMZNX/USD",
    rrFeedSymbol: "Crypto.AMZNX/AMZN.RR",
    nextExDate: "None",
    quarterlyBpsEst: 0,
    hue: "#C27A1A",
  },
];

export const SPYX_MINT = MARKETS[0].mint;
export const MAINNET_RPC = process.env.SOLANA_RPC || "https://solana-rpc.publicnode.com";

/** Model parameters for the dividend claim market. */
export const TERM_DAYS = 365;
export const SELL_DISCOUNT = 0.08; // bid: what a seller receives vs fair value
export const BUY_DISCOUNT = 0.05; // ask: what a buyer pays vs fair value
export const US_TREASURY_1Y_PCT = 4.12; // 1Y US Treasury benchmark rate for yield curve spread
