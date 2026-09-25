"use client";
import Sk from "@/components/Sk";
import { useMarkets } from "../useMarkets";
import { usd, short, dateUTC, pct } from "@/lib/format";

export default function ProofStrip() {
  const { data } = useMarkets();
  const spy = data?.markets.find((m) => m.x === "SPYx");
  const last = spy?.bumps[spy.bumps.length - 1];
  const items: [string, React.ReactNode][] = spy
    ? [
        ["SPYx · live", usd(spy.xPrice)],
        spy.pythX ? ["Pyth SPYx reference", `${usd(spy.pythX)} · ${dateUTC(spy.pythXPublish!)}`] : ["SPYx · Jupiter live", usd(spy.xPrice)],
        ["Multiplier", spy.multiplier?.toFixed(9) ?? <Sk />],
        ["Div 12M", pct(spy.trailingYield, 3)],
        ["Last bump", last ? `+${(100 * (last.next / last.prev - 1)).toFixed(6)} per 100 · ${dateUTC(last.at)}` : <Sk />],
        ["dSPYx bid", usd(spy.bid, 3)],
        ["Mint", short(spy.mint, 5, 5)],
        ...data!.markets.filter((m) => m.x !== "SPYx" && m.xPrice && m.trailingYield > 0).map((m) => [m.x, `${usd(m.xPrice)} · ${pct(m.trailingYield, 2)}`] as [string, string]),
      ]
    : [["SPYx · live", <Sk key="a" />], ["Pyth SPYx reference", <Sk key="b" />], ["Multiplier", <Sk key="c" />], ["Div 12M", <Sk key="d" />]];
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
      <div className="absolute left-0 top-0 z-10 flex h-full items-center">
        <div className="flex h-full items-center gap-2 border-r border-line bg-bg-2 pl-5 pr-4">
          <span className="live-dot h-1.5 w-1.5 rounded-full bg-lime" />
          <span className="micro !text-[10px] text-lime">Live</span>
        </div>
        <div className="h-full w-10 bg-gradient-to-r from-bg-2 to-transparent" />
      </div>
      <div className="marquee flex w-max pl-24">{row("a")}{row("b")}</div>
    </div>
  );
}
