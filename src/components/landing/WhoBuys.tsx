"use client";
import { useSpotlight } from "../useSpotlight";
import Reveal from "./Reveal";

function Side({ tag, title, body, points }: { tag: string; title: string; body: string; points: string[] }) {
  const s = useSpotlight(8);
  return (
    <div {...s} className="card spot h-full p-8 sm:p-10" style={{ transformStyle: "preserve-3d" }}>
      <div style={{ transform: "translateZ(24px)" }}>
        <div className="micro text-lime">{tag}</div>
        <div className="display mt-6 text-4xl leading-tight">{title}</div>
        <p className="mt-4 text-dim">{body}</p>
        <ul className="mt-8 space-y-3">
          {points.map((p) => (
            <li key={p} className="flex gap-3 text-[15px]"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-lime" />{p}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default function WhoBuys() {
  return (
    <section className="mx-auto max-w-6xl px-6 py-28">
      <Reveal>
        <div className="micro text-lime">Two sides of one coupon</div>
        <h2 className="display h2 mt-5 max-w-3xl">Who sells the coupon, <em className="text-lime">and who buys it.</em></h2>
      </Reveal>
      <div className="mt-14 grid gap-5 md:grid-cols-2">
        <Reveal><Side tag="Seller · holds SPYx" title="Cash now, shares kept." body="Long term holders turn a year of slow multiplier drips into one payment today." points={["Keep 100% of index exposure through pSPYx", "Get paid upfront for income you would wait a year for", "Recombine p + d into SPYx whenever you want"]} /></Reveal>
        <Reveal delay={0.08}><Side tag="Buyer · wants yield" title="Dividends at a discount." body="Buy dSPYx below fair value and collect every bump the issuer applies until maturity." points={["Pure income exposure, no need to own the index", "Payout set by the onchain multiplier, not a promise", "Priced off live prices and the real bump history"]} /></Reveal>
      </div>
    </section>
  );
}
