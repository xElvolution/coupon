"use client";
import { useMarkets } from "../useMarkets";
import { usd, short, dateUTC, pct, ago } from "@/lib/format";

export default function ProofStrip() {
  const { data } = useMarkets();
  const spy = data?.markets.find((m) => m.x === "SPYx");
  const last = spy?.bumps[spy.bumps.length - 1];
  const items: [string, string][] = spy
    ? [
        ["SPYx · Pyth", `${usd(spy.xPrice)} · ${ago(spy.xPublish)}`],
        ["SPY · Pyth", `${usd(spy.equity)} · ${ago(spy.equityPublish)}`],
        ["Multiplier", spy.multiplier?.toFixed(9) ?? "…"],
        ["Div 12M", pct(spy.trailingYield, 3)],
        ["Last bump", last ? `+${(100 * (last.next / last.prev - 1)).toFixed(6)} per 100 · ${dateUTC(last.at)}` : "…"],
        ["dSPYx bid", usd(spy.bid, 3)],
        ["Mint", short(spy.mint, 5, 5)],
        ...data!.markets.filter((m) => m.x !== "SPYx" && m.xPrice && m.trailingYield > 0).map((m) => [m.x, `${usd(m.xPrice)} · ${pct(m.trailingYield, 2)}`] as [string, string]),
      ]
    : [["Reading Solana mainnet", "…"], ["Reading Pyth", "…"], ["SPYx", "…"], ["Multiplier", "…"]];
  const row = (k: string) => (
    <div className="flex shrink-0 items-center" key={k} aria-hidden={k === "b"}>
      {items.map(([a, b], i) => (
        <div key={i} className="flex items-center gap-3 whitespace-nowrap px-6">
          <span className="micro !text-[10px] text-faint">{a}</span>
          <span className="num text-[13px] text-ink">{b}</span>
          <span className="ml-6 h-1 w-1 rounded-full bg-lime/60" />
        </div>
      ))}
    </div>
  );
  return (
    <div className="relative overflow-hidden border-y border-line bg-bg-2 py-3.5">
      <div className="absolute left-0 top-0 z-10 flex h-full items-center gap-2 bg-gradient-to-r from-bg-2 via-bg-2 to-transparent pl-5 pr-10">
        <span className="live-dot h-1.5 w-1.5 rounded-full bg-lime" />
        <span className="micro !text-[10px] text-lime">Live</span>
      </div>
      <div className="marquee flex w-max pl-24">{row("a")}{row("b")}</div>
    </div>
  );
}
