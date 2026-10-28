"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { Row } from "@/components/app/ui";
import { TOKEN_LOGOS } from "@/lib/token-logos";
import { units, short } from "@/lib/format";
import type { PerpCandle, PerpMarket } from "@/lib/perps-data";

export function BybitCandlestickChart({
  candles,
  symbol,
  showMa = true,
}: {
  candles: PerpCandle[];
  symbol: string;
  showMa?: boolean;
}) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const w = 760;
  const h = 300;
  const padL = 10;
  const padR = 54;
  const padT = 18;
  const padB = 56;
  const chartW = w - padL - padR;
  const chartH = h - padT - padB;

  const highs = candles.map((c) => Math.max(c.high, c.ma7, c.ma14, c.ma28));
  const lows = candles.map((c) => Math.min(c.low, c.ma7, c.ma14, c.ma28));
  const maxP = Math.max(...highs);
  const minP = Math.min(...lows);
  const rangeP = Math.max(0.01, maxP - minP);
  const maxVol = Math.max(...candles.map((c) => c.volume), 1);

  const yOf = (p: number) => padT + (1 - (p - minP) / rangeP) * chartH;
  const xStep = chartW / Math.max(1, candles.length);

  const highestIdx = candles.reduce((bi, c, i) => (c.high > candles[bi].high ? i : bi), 0);
  const lowestIdx = candles.reduce((bi, c, i) => (c.low < candles[bi].low ? i : bi), 0);

  const maPath = (key: "ma7" | "ma14" | "ma28") =>
    candles
      .map((c, i) => `${i === 0 ? "M" : "L"} ${(padL + i * xStep + xStep / 2).toFixed(1)} ${yOf(c[key]).toFixed(1)}`)
      .join(" ");

  const activeIdx = hoverIdx ?? candles.length - 1;
  const active = candles[activeIdx] ?? candles[candles.length - 1];
  const changeUsd = active ? active.close - active.open : 0;
  const changePct = active && active.open > 0 ? (changeUsd / active.open) * 100 : 0;
  const candleRange = active ? active.high - active.low : 0;
  const candleRangePct = active && active.low > 0 ? (candleRange / active.low) * 100 : 0;

  const handleScrub = (clientX: number) => {
    if (!svgRef.current || candles.length === 0) return;
    const rect = svgRef.current.getBoundingClientRect();
    const relX = ((clientX - rect.left) / Math.max(1, rect.width)) * w;
    const idx = Math.floor((relX - padL) / xStep);
    const clamped = Math.max(0, Math.min(candles.length - 1, idx));
    setHoverIdx(clamped);
  };

  return (
    <div className="relative select-none">
      {/* Compact OHLC + MA7 / MA14 / MA28 Readout Bar */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line/60 bg-bg/30 px-3 py-1.5 text-[10px] font-mono">
        {active && (
          <>
            <span className="text-dim">
              O <strong className="text-ink">{active.open.toFixed(2)}</strong>
            </span>
            <span className="text-dim">
              H <strong className="text-[#16C784]">{active.high.toFixed(2)}</strong>
            </span>
            <span className="text-dim">
              L <strong className="text-[#EA3943]">{active.low.toFixed(2)}</strong>
            </span>
            <span className="text-dim">
              C <strong className="text-ink">{active.close.toFixed(2)}</strong>
            </span>
          </>
        )}
        {showMa && (
          <>
            <span className="text-[#F5A623]">MA7:{active?.ma7.toFixed(2)}</span>
            <span className="text-[#38BDF8]">MA14:{active?.ma14.toFixed(2)}</span>
            <span className="text-[#C084FC]">MA28:{active?.ma28.toFixed(2)}</span>
          </>
        )}
        <span className="ml-auto text-faint hidden sm:inline">{symbol} · Pyth 400ms</span>
      </div>

      <div className="relative">
        {/* Floating OHLCV Tooltip Card on Scrub/Tap */}
        {hoverIdx !== null && active && (
          <div className="pointer-events-none absolute left-2.5 top-2.5 z-20 w-44 rounded-lg border border-white/15 bg-[#11131A]/95 p-2 text-[10px] font-mono shadow-xl backdrop-blur-md">
            <div className="flex justify-between text-dim">
              <span>Time</span>
              <span className="text-ink">{active.t}</span>
            </div>
            <div className="mt-0.5 flex justify-between text-dim">
              <span>Open</span>
              <span className="text-ink">{active.open.toFixed(2)}</span>
            </div>
            <div className="mt-0.5 flex justify-between text-dim">
              <span>High</span>
              <span className="text-ink">{active.high.toFixed(2)}</span>
            </div>
            <div className="mt-0.5 flex justify-between text-dim">
              <span>Low</span>
              <span className="text-ink">{active.low.toFixed(2)}</span>
            </div>
            <div className="mt-0.5 flex justify-between text-dim">
              <span>Close</span>
              <span className="text-ink">{active.close.toFixed(2)}</span>
            </div>
            <div className="mt-0.5 flex justify-between text-dim">
              <span>Change</span>
              <span className={changeUsd >= 0 ? "text-[#16C784]" : "text-[#EA3943]"}>
                {changeUsd >= 0 ? "+" : ""}
                {changeUsd.toFixed(2)} ({changePct >= 0 ? "+" : ""}
                {changePct.toFixed(2)}%)
              </span>
            </div>
            <div className="mt-0.5 flex justify-between text-dim">
              <span>Range</span>
              <span className="text-ink">
                {candleRange.toFixed(2)} ({candleRangePct.toFixed(2)}%)
              </span>
            </div>
            <div className="mt-0.5 flex justify-between text-dim">
              <span>Volume</span>
              <span className="text-ink">{units(active.volume, 0)}</span>
            </div>
          </div>
        )}

        <svg
          ref={svgRef}
          viewBox={`0 0 ${w} ${h}`}
          className="h-[225px] w-full touch-pan-y overflow-visible sm:h-[290px]"
          onPointerDown={(e) => handleScrub(e.clientX)}
          onPointerMove={(e) => {
            if (e.pointerType === "mouse" || e.buttons > 0) handleScrub(e.clientX);
          }}
          onTouchStart={(e) => {
            if (e.touches[0]) handleScrub(e.touches[0].clientX);
          }}
          onTouchMove={(e) => {
            if (e.touches[0]) handleScrub(e.touches[0].clientX);
          }}
          onMouseLeave={() => setHoverIdx(null)}
        >
          {[0, 0.25, 0.5, 0.75, 1].map((g) => {
            const py = padT + g * chartH;
            const val = maxP - g * rangeP;
            return (
              <g key={g}>
                <line
                  x1={padL}
                  x2={w - padR}
                  y1={py}
                  y2={py}
                  stroke="rgba(255,255,255,0.05)"
                  strokeDasharray="2 3"
                />
                <text
                  x={w - padR + 5}
                  y={py + 3}
                  fill="#6E7687"
                  fontSize="9.5"
                  fontFamily="monospace"
                >
                  {val.toFixed(2)}
                </text>
              </g>
            );
          })}

          {/* Candlesticks + Volume Histogram */}
          {candles.map((c, i) => {
            const cx = padL + i * xStep + xStep / 2;
            const up = c.close >= c.open;
            const color = up ? "#16C784" : "#EA3943";
            const topY = yOf(Math.max(c.open, c.close));
            const botY = yOf(Math.min(c.open, c.close));
            const bodyH = Math.max(2, botY - topY);
            const bw = Math.max(3, Math.min(10, xStep * 0.62));

            const volH = (c.volume / maxVol) * 34;
            const volY = h - 16 - volH;

            return (
              <g key={i}>
                <line x1={cx} x2={cx} y1={yOf(c.high)} y2={yOf(c.low)} stroke={color} strokeWidth="1.2" />
                <rect x={cx - bw / 2} y={topY} width={bw} height={bodyH} fill={color} rx="1" />
                <rect
                  x={cx - bw / 2}
                  y={volY}
                  width={bw}
                  height={Math.max(1.5, volH)}
                  fill={color}
                  opacity="0.38"
                />
              </g>
            );
          })}

          {/* Smooth Moving Average Lines */}
          {showMa && (
            <>
              <path d={maPath("ma7")} fill="none" stroke="#F5A623" strokeWidth="1.4" />
              <path d={maPath("ma14")} fill="none" stroke="#38BDF8" strokeWidth="1.4" />
              <path d={maPath("ma28")} fill="none" stroke="#C084FC" strokeWidth="1.4" />
            </>
          )}

          {/* High / Low Callout Pins */}
          {candles[highestIdx] && (
            <text
              x={Math.min(w - padR - 36, Math.max(padL + 10, padL + highestIdx * xStep))}
              y={Math.max(11, yOf(candles[highestIdx].high) - 4)}
              fill="#ECE8DC"
              fontSize="9.5"
              fontFamily="monospace"
            >
              {candles[highestIdx].high.toFixed(2)}
            </text>
          )}
          {candles[lowestIdx] && (
            <text
              x={Math.min(w - padR - 36, Math.max(padL + 10, padL + lowestIdx * xStep))}
              y={Math.min(padT + chartH + 10, yOf(candles[lowestIdx].low) + 10)}
              fill="#8A8F98"
              fontSize="9.5"
              fontFamily="monospace"
            >
              {candles[lowestIdx].low.toFixed(2)}
            </text>
          )}

          {/* Active Crosshair */}
          {hoverIdx !== null && candles[hoverIdx] && (
            <>
              <line
                x1={padL + hoverIdx * xStep + xStep / 2}
                x2={padL + hoverIdx * xStep + xStep / 2}
                y1={padT}
                y2={h - 16}
                stroke="rgba(255,255,255,0.35)"
                strokeDasharray="3 3"
              />
              <line
                x1={padL}
                x2={w - padR}
                y1={yOf(candles[hoverIdx].close)}
                y2={yOf(candles[hoverIdx].close)}
                stroke="rgba(255,255,255,0.28)"
                strokeDasharray="3 3"
              />
            </>
          )}

          {/* X-Axis Timestamps */}
          {candles
            .map((c, i) => ({ c, i }))
            .filter(({ i }) => i % Math.max(1, Math.floor(candles.length / 5)) === 0 || i === candles.length - 1)
            .map(({ c, i }) => (
              <text
                key={i}
                x={padL + i * xStep + xStep / 2}
                y={h - 3}
                textAnchor="middle"
                fill="#6E7687"
                fontSize="9.5"
                fontFamily="monospace"
              >
                {c.t}
              </text>
            ))}
        </svg>
      </div>
    </div>
  );
}

export function BybitCompanyTab({ market }: { market: PerpMarket }) {
  const [sub, setSub] = useState<"profile" | "dividend" | "splits">("profile");

  return (
    <div className="space-y-4 p-3.5 sm:p-5">
      <div className="flex items-center gap-2">
        {(
          [
            ["profile", "Profile"],
            ["dividend", "Dividend"],
            ["splits", "Token-2022 Specs"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setSub(k)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              sub === k
                ? "bg-surface-2 text-ink border border-line-2"
                : "text-dim hover:text-ink"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {sub === "profile" && (
        <>
          <div>
            <h3 className="text-sm font-semibold text-ink sm:text-base">Company Overview</h3>
            <p className="mt-1.5 text-xs leading-relaxed text-dim sm:text-sm">{market.overview}</p>
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold text-ink sm:text-base">Information</h3>
            <div className="divide-y divide-line rounded-xl border border-line bg-bg/40 px-3.5">
              <Row k="Company Name" v={market.companyFull} />
              <Row k="Industry" v={market.industry} />
              <Row k="Sector" v={market.sector} />
              <Row k="Primary Exchange" v={market.exchange} />
              <Row k="Listing Date" v={market.listingDate} />
              <Row k="Headquarters" v={market.headquarters} />
              <Row k="Employees" v={market.employees} />
              <Row k="Website" v={market.website} />
            </div>
          </div>
        </>
      )}

      {sub === "dividend" && (
        <div className="space-y-3.5">
          <div className="rounded-xl border border-line bg-bg/50 p-3.5">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-ink">Dividend &amp; Coupon Schedule</div>
                <div className="mt-0.5 text-xs text-dim">Frequency: {market.dividendFrequency}</div>
              </div>
              <span className="num rounded-full bg-[#16C784]/15 px-2.5 py-1 text-xs font-semibold text-[#16C784]">
                {market.dividendYieldApy.toFixed(2)}% APY
              </span>
            </div>
            <div className="mt-3 divide-y divide-line">
              <Row k="Distribution Amount" v={market.dividendPerShare} accent />
              <Row k="Next Ex-Dividend Date" v={market.nextExDivDate} />
              <Row k="Token-2022 Multiplier" v={market.tokenMultiplier} />
              <Row k="Long Perp Carry Credit" v={`+${market.dividendYieldApy.toFixed(2)}% annualized`} accent />
            </div>
            <div className="mt-3 flex items-center justify-between gap-2 border-t border-line pt-3">
              <span className="text-[11px] text-dim">Strip {market.symbol} into principal (p) &amp; dividend coupon (d)</span>
              <Link href={`/app/split?x=${market.symbol}`} className="btn btn-lime h-8 px-3 text-xs">
                Split {market.symbol} →
              </Link>
            </div>
          </div>
        </div>
      )}

      {sub === "splits" && (
        <div className="divide-y divide-line rounded-xl border border-line bg-bg/40 px-3.5">
          <Row k="Onchain Asset" v={market.symbol} accent />
          <Row k="Solana Token-2022 Mint" v={short(market.mintAddress, 8, 6)} />
          <Row k="Current ScaledUiAmount" v={market.tokenMultiplier} />
          <Row k="Oracle Price Feed" v="Pyth Network (400ms)" />
          <Row k="Max Perp Leverage" v={`${market.maxLeverage}x Cross / Isolated`} />
        </div>
      )}
    </div>
  );
}

export function BybitFinancialsTab({ market }: { market: PerpMarket }) {
  const [incPeriod, setIncPeriod] = useState<"quarterly" | "annual">("quarterly");
  const [balPeriod, setBalPeriod] = useState<"quarterly" | "annual">("quarterly");

  const incRows = incPeriod === "quarterly" ? market.quarterlyFinancials : market.annualFinancials;
  const balRows = balPeriod === "quarterly" ? market.quarterlyFinancials : market.annualFinancials;

  const maxRev = Math.max(...incRows.map((r) => Math.max(r.revenueB, r.netIncomeB)), 1);
  const maxAssets = Math.max(...balRows.map((r) => Math.max(r.assetsB, r.liabilitiesB)), 1);

  return (
    <div className="space-y-5 p-3.5 sm:p-5">
      <div className="rounded-xl border border-line bg-bg/40 p-3.5">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-ink sm:text-base">Income Statement</h3>
          <span className="text-[11px] text-dim">USD (Billions)</span>
        </div>

        <div className="mt-2.5 grid grid-cols-2 rounded-full bg-surface p-0.5 text-xs">
          {(["quarterly", "annual"] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setIncPeriod(k)}
              className={`rounded-full py-1 font-medium capitalize transition-colors ${
                incPeriod === k ? "bg-surface-2 text-ink" : "text-dim hover:text-ink"
              }`}
            >
              {k}
            </button>
          ))}
        </div>

        <div className="mt-4 grid grid-cols-5 items-end gap-2 pt-4" style={{ height: 148 }}>
          {incRows.map((r) => {
            const revH = Math.max(12, Math.round((r.revenueB / maxRev) * 105));
            const netH = Math.max(8, Math.round((Math.max(0.2, r.netIncomeB) / maxRev) * 105));
            return (
              <div key={r.period} className="flex flex-col items-center gap-1.5">
                <div className="flex items-end gap-1.5" style={{ height: 110 }}>
                  <div
                    className="w-3 rounded-t bg-[#16C784] sm:w-4"
                    style={{ height: revH }}
                    title={`Revenue: $${r.revenueB.toFixed(1)}B`}
                  />
                  <div
                    className="w-3 rounded-t bg-[#F5A623] sm:w-4"
                    style={{ height: netH }}
                    title={`Net Income: $${r.netIncomeB.toFixed(1)}B`}
                  />
                </div>
                <span className="num text-[10px] text-dim">{r.period}</span>
              </div>
            );
          })}
        </div>

        <div className="mt-2 flex items-center justify-center gap-5 text-[11px] text-dim">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-[#16C784]" /> Revenue
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-[#F5A623]" /> Net Income
          </span>
        </div>
      </div>

      <div className="rounded-xl border border-line bg-bg/40 p-3.5">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-ink sm:text-base">Balance Sheet</h3>
          <span className="text-[11px] text-dim">Assets vs Liabilities ($B)</span>
        </div>

        <div className="mt-2.5 grid grid-cols-2 rounded-full bg-surface p-0.5 text-xs">
          {(["quarterly", "annual"] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setBalPeriod(k)}
              className={`rounded-full py-1 font-medium capitalize transition-colors ${
                balPeriod === k ? "bg-surface-2 text-ink" : "text-dim hover:text-ink"
              }`}
            >
              {k}
            </button>
          ))}
        </div>

        <div className="mt-4 grid grid-cols-5 items-end gap-2 pt-4" style={{ height: 148 }}>
          {balRows.map((r) => {
            const astH = Math.max(12, Math.round((r.assetsB / maxAssets) * 105));
            const liaH = Math.max(8, Math.round((r.liabilitiesB / maxAssets) * 105));
            return (
              <div key={r.period} className="flex flex-col items-center gap-1.5">
                <div className="flex items-end gap-1.5" style={{ height: 110 }}>
                  <div
                    className="w-3 rounded-t bg-[#16C784] sm:w-4"
                    style={{ height: astH }}
                    title={`Assets: $${r.assetsB.toFixed(1)}B`}
                  />
                  <div
                    className="w-3 rounded-t bg-[#F5A623] sm:w-4"
                    style={{ height: liaH }}
                    title={`Liabilities: $${r.liabilitiesB.toFixed(1)}B`}
                  />
                </div>
                <span className="num text-[10px] text-dim">{r.period}</span>
              </div>
            );
          })}
        </div>

        <div className="mt-2 flex items-center justify-center gap-5 text-[11px] text-dim">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-[#16C784]" /> Total Assets
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-[#F5A623]" /> Total Liabilities
          </span>
        </div>
      </div>
    </div>
  );
}

export function BybitMarketDrawer({
  open,
  onClose,
  markets,
  selectedTicker,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  markets: PerpMarket[];
  selectedTicker: string;
  onSelect: (ticker: string) => void;
}) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<"All" | "US Stocks" | "ETFs">("All");

  if (!open) return null;

  const filtered = markets.filter((m) => {
    if (cat === "ETFs" && m.sector !== "Index ETF") return false;
    if (cat === "US Stocks" && m.sector === "Index ETF") return false;
    if (!q.trim()) return true;
    const s = q.toLowerCase();
    return (
      m.symbol.toLowerCase().includes(s) ||
      m.name.toLowerCase().includes(s) ||
      m.ticker.toLowerCase().includes(s)
    );
  });

  return (
    <div
      className="fixed inset-0 z-[75] flex flex-col justify-end bg-black/75 backdrop-blur-sm sm:items-center sm:justify-center sm:p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[84svh] w-full flex-col overflow-hidden rounded-t-2xl border border-line-2 bg-[#0F1117] sm:max-w-md sm:rounded-2xl"
      >
        <div className="mx-auto mt-2 h-1 w-9 rounded-full bg-white/20 sm:hidden" />
        <div className="p-3.5">
          <div className="flex items-center gap-2 rounded-xl border border-line-2 bg-surface px-3 py-2">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-dim">
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.3-4.3" />
            </svg>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search stock perp (e.g. NVDA, SPY, TSLA)"
              className="w-full bg-transparent text-xs text-ink outline-none placeholder:text-dim"
            />
            {q && (
              <button type="button" onClick={() => setQ("")} className="text-xs text-dim hover:text-ink">
                ✕
              </button>
            )}
          </div>

          <div className="mt-2.5 flex items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-1.5">
              {(["All", "US Stocks", "ETFs"] as const).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCat(c)}
                  className={`rounded-lg px-2.5 py-1 font-medium transition-colors ${
                    cat === c ? "bg-surface-2 text-ink" : "text-dim hover:text-ink"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-line-2 px-2 py-0.5 text-[11px] text-dim hover:text-ink"
            >
              Close
            </button>
          </div>

          <div className="mt-3 grid grid-cols-[1.5fr_1fr_84px] text-[10px] text-dim">
            <span>Contract / Market Cap</span>
            <span className="text-right">Mark Price</span>
            <span className="text-right">24h Change</span>
          </div>
        </div>

        <div className="divide-y divide-line/60 overflow-y-auto px-3.5 pb-5">
          {filtered.map((m) => {
            const up = m.change24hPct >= 0;
            const active = m.ticker === selectedTicker;
            return (
              <button
                key={m.ticker}
                type="button"
                onClick={() => {
                  onSelect(m.ticker);
                  onClose();
                }}
                className={`grid w-full grid-cols-[1.5fr_1fr_84px] items-center py-2.5 text-left transition-colors hover:bg-surface/60 ${
                  active ? "bg-surface/80" : ""
                }`}
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  {TOKEN_LOGOS[m.symbol] && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={TOKEN_LOGOS[m.symbol]} alt={m.symbol} className="h-7 w-7 shrink-0 rounded-full" />
                  )}
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="num text-xs font-bold text-ink sm:text-sm">{m.symbol.replace(/x$/, "")}-PERP</span>
                      <span className="rounded bg-lime/15 px-1 py-0.5 text-[9px] font-bold text-lime">{m.maxLeverage}x</span>
                    </div>
                    <div className="truncate text-[10px] text-dim">
                      {m.name} · {m.marketCap}
                    </div>
                  </div>
                </div>

                <div className="text-right">
                  <div className="num text-xs font-semibold text-ink sm:text-sm">${m.markPrice.toFixed(2)}</div>
                  <div className="num text-[10px] text-[#16C784]">+{m.dividendYieldApy.toFixed(2)}% Carry</div>
                </div>

                <div className="flex justify-end">
                  <span
                    className={`num inline-flex min-w-[68px] items-center justify-center rounded-full px-2 py-1 text-[11px] font-semibold text-white ${
                      up ? "bg-[#16C784]" : "bg-[#EA3943]"
                    }`}
                  >
                    {up ? "+" : ""}
                    {m.change24hPct.toFixed(2)}%
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
