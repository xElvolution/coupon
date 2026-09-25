"use client";
import { useRef, useState } from "react";
import gsap from "gsap";
import Reveal from "./Reveal";

const QA = [
  ["Where does the dividend actually come from?", "Backed reinvests each SPY dividend into SPYx by raising the Token-2022 multiplier on the mint. The increase between the old and new multiplier is the dividend. dSPYx is entitled to exactly that increase on the deposited base units for 12 months."],
  ["Why is the yield lower than SPY's headline yield?", "Because we only use what the chain shows. SPYx dividends are reinvested net of withholding tax, so the realized onchain yield is lower. We price coupons from the real bumps, never from a marketing number."],
  ["What runs on Solana today?", "The SPYx price is the live Solana market price, cross checked against the Pyth SPYx feed (Hermes streams it when an API key is configured, otherwise we read the Pyth price account on Solana and show when it last updated). Multipliers are read from the SPYx mint on Solana mainnet. The vault is a real Solana program on devnet: split, recombine, claim, redeem, a faucet, and a constant product pool per coupon. It runs on devnet test tokens whose Token-2022 multipliers mirror the mainnet values, so nothing trades on mainnet."],
];

function Item({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  const body = useRef<HTMLDivElement>(null);
  const toggle = () => {
    const el = body.current;
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (open) gsap.to(el, { height: 0, duration: reduce ? 0 : 0.45, ease: "power3.inOut" });
    else gsap.fromTo(el, { height: 0 }, { height: "auto", duration: reduce ? 0 : 0.55, ease: "power3.out" });
    setOpen(!open);
  };
  return (
    <div className="border-b border-line">
      <button onClick={toggle} className="flex w-full items-center justify-between gap-6 py-7 text-left" aria-expanded={open}>
        <span className="display text-2xl sm:text-3xl">{q}</span>
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-line-2 transition-all duration-300 ${open ? "rotate-45 border-lime text-lime" : ""}`}>+</span>
      </button>
      <div ref={body} className="h-0 overflow-hidden">
        <p className="max-w-3xl pb-8 text-[16px] leading-relaxed text-dim">{a}</p>
      </div>
    </div>
  );
}

export default function Faq() {
  return (
    <section className="mx-auto max-w-6xl px-6 py-28">
      <Reveal>
        <div className="micro text-lime">Questions</div>
        <h2 className="display h2 mt-5">The fine print, <em className="text-lime">in plain words.</em></h2>
      </Reveal>
      <div className="mt-10 border-t border-line">{QA.map(([q, a]) => <Item key={q} q={q} a={a} />)}</div>
    </section>
  );
}
