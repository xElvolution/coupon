export const usd = (n: number | null | undefined, d = 2) =>
  n == null || !isFinite(n) ? "" : n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: d, maximumFractionDigits: d });
export const pct = (n: number | null | undefined, d = 2) => (n == null || !isFinite(n) ? "" : `${(n * 100).toFixed(d)}%`);
export const units = (n: number | null | undefined, d = 4) => (n == null || !isFinite(n) ? "" : n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }));
export const short = (s: string, a = 4, b = 4) => `${s.slice(0, a)}…${s.slice(-b)}`;
export const dateUTC = (iso: string | number) =>
  new Date(typeof iso === "number" ? iso * 1000 : iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
export const ago = (sec: number | null | undefined) => {
  if (!sec) return "";
  const s = Math.max(0, Math.round(Date.now() / 1000 - sec));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
};

export type PriceSource = "pyth" | "jupiter" | "pyth-onchain" | "none";
/** Short honest label for where the coupon price comes from. */
export const srcLabel = (s?: PriceSource) => (s === "pyth" ? "Pyth live" : s === "jupiter" ? "Live · Solana" : s === "pyth-onchain" ? "Pyth last update" : "Loading");
export const srcLong = (s?: PriceSource) =>
  s === "pyth" ? "Pyth Hermes, live" : s === "jupiter" ? "Live Solana market price via Jupiter" : s === "pyth-onchain" ? "Pyth price account on Solana, last update" : "Loading";
