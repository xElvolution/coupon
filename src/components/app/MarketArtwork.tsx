"use client";
import { TOKEN_LOGOS } from "@/lib/token-logos";

export interface ArtworkTheme {
  primary: string;
  secondary: string;
  glow: string;
  pattern: "grid-wave" | "rings" | "bars" | "orbit" | "prism" | "pulse";
  tagline: string;
}

export const STOCK_THEMES: Record<string, ArtworkTheme> = {
  SPYx: {
    primary: "#C8F560",
    secondary: "#1F5C45",
    glow: "rgba(200, 245, 96, 0.28)",
    pattern: "grid-wave",
    tagline: "S&P 500 Index · 500 US Large-Cap Equities",
  },
  NVDAx: {
    primary: "#76B900",
    secondary: "#193800",
    glow: "rgba(118, 185, 0, 0.32)",
    pattern: "prism",
    tagline: "NVIDIA Corp · AI & Accelerated Computing",
  },
  AAPLx: {
    primary: "#E2E8F0",
    secondary: "#334155",
    glow: "rgba(226, 232, 240, 0.25)",
    pattern: "rings",
    tagline: "Apple Inc · Consumer Silicon & Services",
  },
  MSFTx: {
    primary: "#38BDF8",
    secondary: "#1E3A8A",
    glow: "rgba(56, 189, 248, 0.28)",
    pattern: "bars",
    tagline: "Microsoft Corp · Cloud & Enterprise AI",
  },
  TSLAx: {
    primary: "#F43F5E",
    secondary: "#7F1D1D",
    glow: "rgba(244, 63, 94, 0.28)",
    pattern: "pulse",
    tagline: "Tesla Inc · Autonomy, Energy & Robotics",
  },
  METAx: {
    primary: "#60A5FA",
    secondary: "#1D4ED8",
    glow: "rgba(96, 165, 250, 0.28)",
    pattern: "orbit",
    tagline: "Meta Platforms · Social Graph & Llama AI",
  },
  GOOGLx: {
    primary: "#FBBF24",
    secondary: "#9A3412",
    glow: "rgba(251, 191, 36, 0.26)",
    pattern: "rings",
    tagline: "Alphabet Inc · Search, Cloud & DeepMind",
  },
  QQQx: {
    primary: "#A855F7",
    secondary: "#4C1D95",
    glow: "rgba(168, 85, 247, 0.28)",
    pattern: "grid-wave",
    tagline: "Nasdaq 100 · Global Tech Leaders",
  },
  AMZNx: {
    primary: "#F59E0B",
    secondary: "#78350F",
    glow: "rgba(245, 158, 11, 0.26)",
    pattern: "bars",
    tagline: "Amazon.com · AWS & Global Commerce",
  },
};

export function MarketArtwork({
  symbol,
  category,
  probability,
  change24h,
  endDate,
  points = [48, 52, 50, 56, 61, 59, 64, 68],
  height = "h-36",
  compact = false,
}: {
  symbol: string;
  category?: string;
  probability?: number;
  change24h?: string;
  endDate?: string;
  points?: number[];
  height?: string;
  compact?: boolean;
}) {
  const theme = STOCK_THEMES[symbol] ?? STOCK_THEMES.SPYx;
  const logo = TOKEN_LOGOS[symbol];

  const min = Math.min(...points) - 4;
  const max = Math.max(...points) + 4;
  const span = Math.max(1, max - min);
  const pathPoints = points
    .map((p, i) => {
      const x = (i / Math.max(1, points.length - 1)) * 280;
      const y = 84 - ((p - min) / span) * 62;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const areaPath = `${pathPoints} L280,96 L0,96 Z`;

  return (
    <div
      className={`relative w-full overflow-hidden select-none ${height}`}
      style={{
        background: `radial-gradient(120% 110% at 88% 12%, ${theme.glow}, transparent 62%), linear-gradient(135deg, #13161C 0%, ${theme.secondary}44 52%, #0B0D10 100%)`,
      }}
    >
      {/* Subtle architectural grid */}
      <svg
        className="pointer-events-none absolute inset-0 h-full w-full opacity-35"
        viewBox="0 0 320 140"
        preserveAspectRatio="none"
      >
        <defs>
          <pattern id={`grid-${symbol}`} width="24" height="24" patternUnits="userSpaceOnUse">
            <path d="M 24 0 L 0 0 0 24" fill="none" stroke="rgba(236,232,220,0.08)" strokeWidth="0.7" />
          </pattern>
          <linearGradient id={`grad-${symbol}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={theme.primary} stopOpacity="0.36" />
            <stop offset="100%" stopColor={theme.primary} stopOpacity="0.0" />
          </linearGradient>
        </defs>
        <rect width="320" height="140" fill={`url(#grid-${symbol})`} />

        {/* Pattern-specific geometric art */}
        {theme.pattern === "rings" && (
          <g stroke={theme.primary} strokeOpacity="0.16" fill="none">
            <circle cx="265" cy="36" r="26" strokeWidth="1.2" />
            <circle cx="265" cy="36" r="46" strokeWidth="1" strokeDasharray="3 3" />
            <circle cx="265" cy="36" r="68" strokeWidth="0.8" />
          </g>
        )}
        {theme.pattern === "prism" && (
          <g stroke={theme.primary} strokeOpacity="0.18" fill="none">
            <polygon points="260,10 305,78 215,78" strokeWidth="1.2" />
            <polygon points="275,22 315,86 235,86" strokeWidth="0.9" strokeDasharray="4 2" />
          </g>
        )}
        {theme.pattern === "orbit" && (
          <g stroke={theme.primary} strokeOpacity="0.18" fill="none">
            <ellipse cx="255" cy="48" rx="62" ry="24" transform="rotate(-18 255 48)" strokeWidth="1.2" />
            <ellipse cx="255" cy="48" rx="62" ry="24" transform="rotate(24 255 48)" strokeWidth="1" />
          </g>
        )}
        {theme.pattern === "bars" && (
          <g fill={theme.primary} fillOpacity="0.12">
            <rect x="218" y="48" width="10" height="52" rx="3" />
            <rect x="234" y="34" width="10" height="66" rx="3" />
            <rect x="250" y="22" width="10" height="78" rx="3" />
            <rect x="266" y="14" width="10" height="86" rx="3" />
            <rect x="282" y="28" width="10" height="72" rx="3" />
          </g>
        )}

        {/* Embedded probability / price wave */}
        <g transform="translate(20, 38)">
          <path d={areaPath} fill={`url(#grad-${symbol})`} />
          <path d={pathPoints} fill="none" stroke={theme.primary} strokeWidth="2.2" strokeLinecap="round" />
        </g>
      </svg>

      {/* Watermark ticker */}
      <div className="pointer-events-none absolute -bottom-3 right-3 font-mono text-[54px] font-bold leading-none tracking-tighter text-white/[0.045]">
        {symbol}
      </div>

      {/* Top row: Logo emblem + Category pill + End Date */}
      <div className="relative z-10 flex h-full flex-col justify-between p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div
              className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/15 bg-bg/80 p-1 shadow-lg backdrop-blur-md"
              style={{ boxShadow: `0 8px 24px -6px ${theme.glow}` }}
            >
              {logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logo} alt={symbol} className="h-full w-full rounded-xl object-cover" />
              ) : (
                <span className="num text-xs font-bold text-ink">{symbol}</span>
              )}
              <span
                className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full border border-bg text-[8px] font-bold text-bg"
                style={{ background: theme.primary }}
              >
                ✓
              </span>
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="num text-xs font-semibold text-ink">{symbol}</span>
                {category && (
                  <span className="rounded-full border border-white/10 bg-bg/65 px-2 py-0.5 text-[10px] font-medium text-dim backdrop-blur-sm">
                    {category}
                  </span>
                )}
              </div>
              {!compact && (
                <div className="mt-0.5 max-w-[190px] truncate text-[11px] text-dim">{theme.tagline}</div>
              )}
            </div>
          </div>

          {probability != null && (
            <div className="rounded-2xl border border-white/12 bg-bg/85 px-3 py-1.5 text-right backdrop-blur-md">
              <div className="flex items-baseline justify-end gap-1">
                <span className="num text-xl font-semibold leading-none" style={{ color: theme.primary }}>
                  {probability}%
                </span>
                <span className="micro !text-[8px] text-dim">chance</span>
              </div>
              {change24h && (
                <div
                  className={`num mt-0.5 text-[10px] ${
                    change24h.startsWith("+") ? "text-lime" : "text-rose-400"
                  }`}
                >
                  {change24h} 24h
                </div>
              )}
            </div>
          )}
        </div>

        {endDate && (
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-bg/70 px-2.5 py-0.5 text-[10px] text-dim backdrop-blur-sm">
              <span className="live-dot h-1.5 w-1.5 rounded-full bg-lime" />
              Resolves {endDate}
            </span>
            <span className="micro rounded-full border border-white/10 bg-bg/70 px-2 py-0.5 !text-[8px] text-share backdrop-blur-sm">
              Onchain Oracle
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
