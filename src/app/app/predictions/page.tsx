"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { PageHead } from "@/components/app/ui";
import { MarketArtwork } from "@/components/app/MarketArtwork";
import { PREDICTION_MARKETS, type PredictionCategory } from "@/lib/predictions-data";
import { usd } from "@/lib/format";

const CATEGORIES: ("Trending" | "All" | PredictionCategory)[] = [
  "Trending",
  "All",
  "Dividends",
  "Earnings & Splits",
  "Price Targets",
];

type SortKey = "volume" | "liquidity" | "volatile" | "ending";

export default function PredictionsPage() {
  const router = useRouter();
  const [category, setCategory] = useState<"Trending" | "All" | PredictionCategory>("Trending");
  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortKey>("volume");

  const filtered = useMemo(() => {
    let list = [...PREDICTION_MARKETS];
    if (category !== "All" && category !== "Trending") {
      list = list.filter((m) => m.category === category);
    }
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter(
        (m) =>
          m.title.toLowerCase().includes(q) ||
          m.symbol.toLowerCase().includes(q) ||
          m.company.toLowerCase().includes(q) ||
          m.category.toLowerCase().includes(q)
      );
    }
    list.sort((a, b) => {
      if (sortBy === "volume") return b.volumeUsd - a.volumeUsd;
      if (sortBy === "liquidity") return b.liquidityUsd - a.liquidityUsd;
      if (sortBy === "volatile") return Math.abs(b.change24hNum) - Math.abs(a.change24hNum);
      return a.endDate.localeCompare(b.endDate);
    });
    return list;
  }, [category, query, sortBy]);

  const totalVolume = useMemo(
    () => PREDICTION_MARKETS.reduce((acc, m) => acc + m.volumeUsd, 0),
    []
  );
  const totalLiquidity = useMemo(
    () => PREDICTION_MARKETS.reduce((acc, m) => acc + m.liquidityUsd, 0),
    []
  );

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHead
        kicker="Prediction Markets"
        title="Trade dividend outcomes,"
        accent="settled on chain."
        sub="Perforated outcome tickets on upcoming xStock dividend hikes, quarterly multiplier steps, and year-end targets. Winning tickets redeem 1:1 for $1.00 USDC."
        right={
          <div className="grid w-full grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line sm:w-auto sm:rounded-2xl">
            <div className="bg-surface px-3.5 py-2 sm:px-4 sm:py-2.5">
              <div className="micro !text-[8px] text-dim">Total Volume</div>
              <div className="num mt-0.5 text-sm font-semibold text-lime sm:text-base">{usd(totalVolume, 0)}</div>
            </div>
            <div className="bg-surface px-3.5 py-2 sm:px-4 sm:py-2.5">
              <div className="micro !text-[8px] text-dim">Active Liquidity</div>
              <div className="num mt-0.5 text-sm font-semibold text-ink sm:text-base">{usd(totalLiquidity, 0)}</div>
            </div>
          </div>
        }
      />

      {/* Compact Category Filter, Search & Sort Strip */}
      <div className="flex flex-col gap-2.5 rounded-2xl border border-line-2 bg-surface p-2.5 sm:flex-row sm:items-center sm:justify-between sm:p-3.5">
        <div className="no-scrollbar flex items-center gap-1 overflow-x-auto pb-0.5 sm:gap-1.5 sm:pb-0">
          {CATEGORIES.map((c) => {
            const active = category === c;
            return (
              <button
                key={c}
                type="button"
                onClick={() => setCategory(c)}
                className={`relative shrink-0 rounded-full px-3 py-1.5 text-[11px] font-medium transition-colors sm:px-3.5 sm:py-2 sm:text-xs ${
                  active ? "text-bg" : "text-dim hover:text-ink"
                }`}
              >
                {active && (
                  <motion.span
                    layoutId="pred-cat-pill"
                    className="absolute inset-0 rounded-full bg-lime"
                    transition={{ type: "spring", stiffness: 450, damping: 32 }}
                  />
                )}
                <span className="relative">{c}</span>
              </button>
            );
          })}
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative min-w-[180px] sm:min-w-[200px]">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search xStock or dividend..."
              className="h-9 w-full rounded-full border border-line-2 bg-bg px-3.5 pr-8 text-xs text-ink outline-none transition-colors placeholder:text-faint focus:border-lime/60"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-dim hover:text-ink"
              >
                ✕
              </button>
            )}
          </div>

          <div className="flex items-center justify-between gap-1 rounded-full border border-line-2 bg-bg p-1 sm:justify-start">
            {(
              [
                ["volume", "Volume"],
                ["liquidity", "Liquidity"],
                ["volatile", "24h Delta"],
                ["ending", "Ending"],
              ] as [SortKey, string][]
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setSortBy(k)}
                className={`flex-1 rounded-full px-2.5 py-1 text-[11px] transition-colors sm:flex-none ${
                  sortBy === k ? "bg-surface-2 font-semibold text-lime" : "text-dim hover:text-ink"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Perforated Coupon Outcome Tickets Grid — Whole Card Clickable, Side-by-Side Yes/No */}
      <div className="grid grid-cols-1 gap-3.5 sm:gap-5 md:grid-cols-2 xl:grid-cols-3">
        {filtered.map((m, idx) => (
          <motion.div
            key={m.id}
            role="button"
            tabIndex={0}
            onClick={() => router.push(`/app/predictions/${m.id}`)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                router.push(`/app/predictions/${m.id}`);
              }
            }}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.03, duration: 0.25 }}
            className="card group flex cursor-pointer flex-col justify-between overflow-hidden border-line-2 transition-all duration-300 hover:-translate-y-1 hover:border-lime/45 hover:shadow-[0_24px_60px_-24px_rgba(200,245,96,0.18)]"
          >
            <div>
              {/* Top Visual Stock Artwork Banner */}
              <div className="overflow-hidden border-b border-line">
                <div className="transition-transform duration-500 group-hover:scale-[1.02]">
                  <MarketArtwork
                    symbol={m.symbol}
                    category={m.category}
                    probability={m.yesCents}
                    change24h={m.change24h}
                    endDate={m.endDate}
                    points={m.sparkline}
                    height="h-28 sm:h-34"
                  />
                </div>
              </div>

              {/* Ticket Body */}
              <div className="p-3.5 pb-3 sm:p-5 sm:pb-4">
                <h3 className="display text-[16px] leading-[1.2] text-ink transition-colors group-hover:text-lime sm:text-[19px]">
                  {m.title}
                </h3>

                {/* 2-Cell Coupon Metric Strip */}
                <div className="mt-2.5 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line">
                  <div className="bg-surface px-2.5 py-1.5 sm:px-3 sm:py-2">
                    <div className="micro !text-[8px] text-dim">{m.currentMetricLabel}</div>
                    <div className="num mt-0.5 truncate text-[11px] font-semibold text-ink sm:text-xs">{m.currentMetricValue}</div>
                  </div>
                  <div className="bg-surface px-2.5 py-1.5 sm:px-3 sm:py-2">
                    <div className="micro !text-[8px] text-dim">Target to Win</div>
                    <div className="num mt-0.5 truncate text-[11px] font-semibold text-lime sm:text-xs">{m.targetMetricValue}</div>
                  </div>
                </div>

                {/* Probability Dual Bar */}
                <div className="mt-2.5">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="num font-semibold text-lime">Yes {m.yesCents}%</span>
                    <span className="num font-semibold text-rose-400">No {m.noCents}%</span>
                  </div>
                  <div className="mt-1 flex h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
                    <div
                      className="h-full rounded-l-full bg-lime transition-all duration-500"
                      style={{ width: `${m.yesCents}%` }}
                    />
                    <div
                      className="h-full rounded-r-full bg-rose-500/80 transition-all duration-500"
                      style={{ width: `${m.noCents}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Perforated Tear Line + Bottom Ticket Stub */}
            <div>
              <div className="relative flex items-center">
                <span className="-ml-2 h-4 w-4 shrink-0 rounded-full border border-line-2 bg-bg" />
                <div className="perf-h h-1.5 w-full bg-surface-2/60" />
                <span className="-mr-2 h-4 w-4 shrink-0 rounded-full border border-line-2 bg-bg" />
              </div>

              <div className="bg-surface-2/30 px-3.5 pb-3 pt-2.5 sm:px-5 sm:pb-4 sm:pt-3">
                {/* Strict Side-by-Side Yes / No Buttons */}
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      router.push(`/app/predictions/${m.id}?side=YES`);
                    }}
                    className="flex h-9 items-center justify-between rounded-xl border border-lime/40 bg-lime/12 px-3 text-xs font-semibold text-lime transition-all hover:bg-lime hover:text-bg sm:h-10"
                  >
                    <span>Yes</span>
                    <span className="num text-xs font-bold sm:text-sm">{m.yesCents}¢</span>
                  </button>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      router.push(`/app/predictions/${m.id}?side=NO`);
                    }}
                    className="flex h-9 items-center justify-between rounded-xl border border-rose-500/35 bg-rose-500/12 px-3 text-xs font-semibold text-rose-300 transition-all hover:bg-rose-500 hover:text-white sm:h-10"
                  >
                    <span>No</span>
                    <span className="num text-xs font-bold sm:text-sm">{m.noCents}¢</span>
                  </button>
                </div>

                {/* Clean Stub Footer */}
                <div className="mt-2 flex items-center justify-between text-[10px] text-dim sm:text-[11px]">
                  <span className="num">
                    {usd(m.volumeUsd, 0)} Vol · {usd(m.liquidityUsd, 0)} Liq
                  </span>
                  <span className="num text-share">Ends {m.endDate}</span>
                </div>
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
