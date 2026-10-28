"use client";
import Sk from "@/components/Sk";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useMarkets } from "@/components/useMarkets";
import { useVault } from "@/components/useVault";
import { ActionButton } from "@/components/app/ActionButton";
import { AmountField, PageHead, Row, Seg, TestNote, TokenDot, TxModal } from "@/components/app/ui";
import { units, usd, short } from "@/lib/format";
import { USDC_DECIMALS, fromRaw, pmAmmBuyShares, toRaw } from "@/lib/vault/sdk";
import { explorerTx } from "@/lib/vault/deployment";

const CATEGORIES: ["ALL" | "MULTIPLIER_STEP" | "REDEMPTION_PEG" | "ANNUAL_YIELD" | "CROSS_ASSET", string][] = [
  ["ALL", "All Contracts"],
  ["MULTIPLIER_STEP", "Multiplier Step"],
  ["REDEMPTION_PEG", "Redemption Peg (.RR)"],
  ["ANNUAL_YIELD", "Annual Yield"],
  ["CROSS_ASSET", "Cross-Asset"],
];

function OutcomesInner() {
  const sp = useSearchParams();
  const { data, get } = useMarkets();
  const v = useVault();

  const outcomes = data?.outcomes ?? [];
  const initX = sp.get("x");
  const initId =
    sp.get("id") ??
    (initX ? outcomes.find((o) => o.xSymbol === initX)?.id : undefined) ??
    "spyx-q4-mult";

  const [cat, setCat] = useState<"ALL" | "MULTIPLIER_STEP" | "REDEMPTION_PEG" | "ANNUAL_YIELD" | "CROSS_ASSET">("ALL");
  const [selectedId, setSelectedId] = useState(initId);
  const [side, setSide] = useState<"YES" | "NO">("YES");
  const [amt, setAmt] = useState("20");
  const [deskBusy, setDeskBusy] = useState(false);
  const [deskSig, setDeskSig] = useState<string | null>(null);

  const filtered = outcomes.filter((o) => cat === "ALL" || o.category === cat);
  const active = outcomes.find((o) => o.id === selectedId) ?? filtered[0] ?? outcomes[0];
  const m = active ? get(active.xSymbol) : get("SPYx");
  const cm = active ? v.markets[active.xSymbol] ?? v.markets["SPYx"] : v.markets["SPYx"];

  const usdcNum = Number(amt) || 0;
  const rawUsdc = toRaw(usdcNum, USDC_DECIMALS);
  const rTarget = active ? Math.max(1, side === "YES" ? active.yesReserve : active.noReserve) : 50_000;
  const rOpp = active ? Math.max(1, side === "YES" ? active.noReserve : active.yesReserve) : 50_000;
  const quote = pmAmmBuyShares(usdcNum, rTarget, rOpp);
  const sharesOut = quote.sharesOut;
  const avgPrice = quote.avgPrice || (side === "YES" ? active?.yesPrice ?? 0.5 : active?.noPrice ?? 0.5);
  const maxPayout = sharesOut; // $1.00 per winning outcome share
  const netProfit = Math.max(0, maxPayout - usdcNum);
  const roiPct = usdcNum > 0 ? (netProfit / usdcNum) * 100 : 0;

  const cashMax = fromRaw(v.usdc, USDC_DECIMALS);
  const hasPool = !!cm?.hasPool || !!cm?.hasPPool;
  const bad = !active || !hasPool || usdcNum <= 0 || (!!v.owner && usdcNum > cashMax + 1e-9);

  const cta = !active
    ? "Loading contract"
    : usdcNum <= 0
    ? "Enter USDC amount"
    : v.owner && usdcNum > cashMax + 1e-9
    ? "Not enough test USDC"
    : `Buy ${side} · ${units(sharesOut, 2)} shares (${Math.round((side === "YES" ? active.yesPrice : active.noPrice) * 100)}¢)`;

  const go = async () => {
    if (!v.vault || !v.owner || bad || !cm || !active) return;
    const probCents = Math.round((side === "YES" ? active.yesPrice : active.noPrice) * 100);
    const ixs = v.vault.outcomeOrder(v.owner, cm.dep, active.id, side === "YES" ? "yes" : "no", rawUsdc);
    const ok = await v.run(
      `Buy ${side} on ${active.id} (${usd(usdcNum)})`,
      ixs,
      (sig) => ({
        action: "outcome",
        symbol: active.xSymbol,
        badge: side === "YES" ? "d" : "p",
        sig,
        at: Date.now(),
        title: `${side} position opened · ${active.xSymbol}`,
        lines: [
          ["Contract", active.id],
          ["Outcome side", `${side} (${probCents}¢)`],
          ["Paid", `${units(usdcNum, 2)} test USDC`],
          ["Outcome shares", `${units(sharesOut, 2)} ${side} ($1.00 payout if ${side})`],
          ["Resolution oracle", active.oracleSource],
        ],
      })
    );
    if (ok) setAmt("20");
  };

  const verifiedOutcomes = (data?.verifiedOrders ?? []).filter((o) => o.kind === "outcome");

  return (
    <div className="pb-32 md:pb-0">
      <PageHead
        kicker="Outcome Markets · pm-AMM · Trustless Oracle Resolution"
        title="Binary dividend &amp; peg outcomes,"
        accent="settled by chain state."
        sub="Prediction markets on corporate dividend bumps, Pyth .RR redemption parity, and annual multiplier thresholds. Every contract resolves deterministically from Solana mainnet Token-2022 ScaledUiAmountConfig and Pyth PriceUpdateV2 accounts with zero human committee."
        right={
          <Link href="/app/pyth" className="btn btn-line h-9 px-3.5 text-xs">
            Inspect Live Oracles ↗
          </Link>
        }
      />

      {/* Category Filter Pills */}
      <div className="mt-6 flex flex-wrap gap-2">
        {CATEGORIES.map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setCat(id)}
            className={`h-9 rounded-full border px-4 text-xs transition-colors ${
              cat === id
                ? "border-lime bg-lime text-bg font-medium"
                : "border-line-2 bg-surface text-dim hover:text-ink"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Main Grid: Left Outcome Cards List, Right pm-AMM Order Ticket */}
      <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-[1.2fr_1fr]">
        {/* Left: Outcome Market Cards */}
        <div className="space-y-3.5">
          {(filtered.length ? filtered : Array.from({ length: 4 }, () => null)).map((o, idx) => {
            const mk = o ? get(o.xSymbol) : undefined;
            const isSel = o && active && o.id === active.id;
            return (
              <div
                key={o?.id ?? idx}
                onClick={() => o && setSelectedId(o.id)}
                className={`card cursor-pointer p-5 transition-colors ${
                  isSel ? "border-lime/60 bg-surface-2/50" : "hover:bg-surface-2/30"
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    {mk ? <TokenDot m={mk} size={26} badge="d" /> : <span className="h-6 w-6 rounded-full bg-surface-2" />}
                    <span className="micro !text-[9px] text-lime">{o?.category.replace("_", " ") ?? <Sk />}</span>
                    <span className="num text-xs text-faint">· Resolves {o?.resolveDate}</span>
                  </div>
                  {o?.verifiedTxSig && (
                    <a
                      href={explorerTx(o.verifiedTxSig)}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="num text-[11px] text-lime hover:underline"
                    >
                      Verified tx {short(o.verifiedTxSig, 4, 4)} ↗
                    </a>
                  )}
                </div>

                <div className="display mt-2.5 text-xl text-ink sm:text-2xl">{o?.title ?? <Sk />}</div>
                <p className="mt-1.5 text-xs text-dim">{o?.subtitle}</p>

                {/* Live Oracle Telemetry Strip inside each card */}
                {o && (
                  <div className="mt-4 grid grid-cols-3 gap-2 rounded-xl border border-line bg-bg/60 p-3 text-xs">
                    <div>
                      <div className="micro !text-[8px] text-faint">{o.targetMetricLabel}</div>
                      <div className="num mt-1 font-medium text-lime">{o.currentMetricValue}</div>
                    </div>
                    <div>
                      <div className="micro !text-[8px] text-faint">Resolution Threshold</div>
                      <div className="num mt-1 text-ink">{o.thresholdLabel}</div>
                    </div>
                    <div>
                      <div className="micro !text-[8px] text-faint">Oracle Source</div>
                      <div className="num mt-1 truncate text-dim">{o.oracleSource}</div>
                    </div>
                  </div>
                )}

                {/* YES / NO Probability Bar & Buttons */}
                {o && (
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-1 items-center gap-2">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedId(o.id);
                          setSide("YES");
                        }}
                        className={`num flex h-9 flex-1 items-center justify-between rounded-xl border px-3.5 text-xs transition-colors ${
                          isSel && side === "YES"
                            ? "border-lime bg-lime/20 text-lime font-medium"
                            : "border-lime/30 bg-lime/10 text-lime hover:bg-lime/20"
                        }`}
                      >
                        <span>YES</span>
                        <span>{Math.round(o.yesPrice * 100)}¢</span>
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedId(o.id);
                          setSide("NO");
                        }}
                        className={`num flex h-9 flex-1 items-center justify-between rounded-xl border px-3.5 text-xs transition-colors ${
                          isSel && side === "NO"
                            ? "border-share bg-share/20 text-ink font-medium"
                            : "border-line-2 bg-surface text-share hover:text-ink"
                        }`}
                      >
                        <span>NO</span>
                        <span>{Math.round(o.noPrice * 100)}¢</span>
                      </button>
                    </div>
                    <div className="num text-xs text-faint">
                      Depth {usd(o.liquidityUsd, 0)} · 24h {usd(o.volume24hUsd, 0)}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Right: pm-AMM Execution Ticket */}
        <div className="card h-fit p-5 sm:p-7 lg:sticky lg:top-24">
          {active && (
            <>
              <div className="flex items-start justify-between gap-3 border-b border-line pb-4">
                <div className="flex items-center gap-3">
                  {m && <TokenDot m={m} size={36} badge={side === "YES" ? "d" : "p"} />}
                  <div>
                    <div className="micro !text-[9px] text-lime">pm-AMM Binary Contract</div>
                    <div className="num mt-0.5 text-sm text-ink">{active.id}</div>
                  </div>
                </div>
                <span className="num rounded-full border border-line-2 px-2.5 py-1 text-xs text-dim">
                  Resolves {active.resolveDate}
                </span>
              </div>

              <div className="mt-4 text-sm font-medium text-ink">{active.title}</div>

              <div className="mt-4 flex items-center justify-between gap-3">
                <Seg
                  options={[
                    ["YES", `Buy YES · ${Math.round(active.yesPrice * 100)}¢`],
                    ["NO", `Buy NO · ${Math.round(active.noPrice * 100)}¢`],
                  ]}
                  value={side}
                  onChange={(s) => setSide(s)}
                />
              </div>

              <div className="mt-5">
                <AmountField
                  label="Order Size (test USDC)"
                  value={amt}
                  onChange={setAmt}
                  max={cashMax}
                  suffix="USDC"
                />
              </div>

              <div className="mt-5 rounded-2xl border border-line bg-bg/60 p-4 sm:p-5">
                <div className="flex items-center justify-between">
                  <span className="micro !text-[9px] text-dim">Payout if {side} Resolves True</span>
                  <span className="num text-xs text-lime">+{roiPct.toFixed(1)}% Return</span>
                </div>
                <div className="num mt-2 text-3xl text-lime sm:text-4xl">
                  {usd(maxPayout, 2)}
                  <span className="ml-2 text-sm text-dim">({units(sharesOut, 2)} shares)</span>
                </div>

                <div className="mt-4 divide-y divide-line border-t border-line">
                  <Row k="Average execution price" v={`${(avgPrice * 100).toFixed(1)}¢ per share`} />
                  <Row k="Net profit on win" v={usd(netProfit, 2)} accent />
                  <Row k="Live oracle reading" v={active.currentMetricValue} />
                  <Row k="Resolution condition" v={active.thresholdLabel} />
                  <Row k="Settlement source" v={active.oracleSource} />
                </div>
              </div>

              <div className="mt-5 space-y-2.5">
                <ActionButton
                  label={cta}
                  connectLabel="Connect a devnet wallet to trade outcomes"
                  disabled={bad}
                  onClick={go}
                />
                {!v.owner && (
                  <button
                    type="button"
                    disabled={deskBusy || usdcNum <= 0}
                    onClick={async () => {
                      setDeskBusy(true);
                      setDeskSig(null);
                      try {
                        const r = await fetch("/api/devnet-exec", {
                          method: "POST",
                          headers: { "content-type": "application/json" },
                          body: JSON.stringify({
                            kind: "outcome",
                            xSymbol: active.xSymbol,
                            id: active.id,
                            side,
                            usdcAmount: usdcNum,
                          }),
                        });
                        const j = await r.json();
                        if (j.sig) setDeskSig(j.sig);
                      } finally {
                        setDeskBusy(false);
                      }
                    }}
                    className="btn btn-line h-11 w-full text-xs"
                  >
                    {deskBusy ? "Submitting to Solana Devnet..." : `Execute Buy ${side} via Devnet Desk Relayer →`}
                  </button>
                )}
                {deskSig && (
                  <div className="flex items-center justify-between rounded-xl border border-lime/40 bg-lime/10 px-4 py-3 text-xs">
                    <span className="text-lime">Confirmed on Solana Devnet (`coupon_market` + `SPL Memo`)</span>
                    <a href={explorerTx(deskSig)} target="_blank" rel="noreferrer" className="num font-medium text-lime underline">
                      {short(deskSig, 6, 6)} ↗
                    </a>
                  </div>
                )}
              </div>
              <TestNote />
            </>
          )}
        </div>
      </div>

      {/* Verified Onchain Devnet Outcome Ledger */}
      <div className="card mt-6 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-6 py-4">
          <div>
            <div className="display text-2xl">Verified Onchain Outcome Market Positions</div>
            <div className="text-xs text-dim">
              Real Solana devnet transactions routed through `coupon_market` (`EPCXp2gEtwa6c28x19XgM2oV9k3T5pLsUiAzEaJUc3WN`) + `SPL Memo`
            </div>
          </div>
          <span className="micro rounded-full border border-lime/30 bg-lime/10 px-3 py-1 !text-[9px] text-lime">
            pm-AMM · Onchain Settlement
          </span>
        </div>
        <div className="divide-y divide-line">
          {verifiedOutcomes.map((o) => {
            const mk = get(o.xSymbol);
            return (
              <a
                key={o.sig}
                href={explorerTx(o.sig)}
                target="_blank"
                rel="noreferrer"
                className="flex flex-wrap items-center justify-between gap-3 px-6 py-3.5 text-sm transition-colors hover:bg-surface-2/50"
              >
                <div className="flex items-center gap-3">
                  {mk && <TokenDot m={mk} size={24} badge={o.side === "YES" ? "d" : "p"} />}
                  <span
                    className={`micro rounded-full border px-2.5 py-0.5 !text-[9px] ${
                      o.side === "YES" ? "border-lime/40 text-lime" : "border-line-2 text-share"
                    }`}
                  >
                    {o.side}
                  </span>
                  <span className="num text-ink">{o.id}</span>
                  <span className="num text-xs text-dim">Stake {usd(o.usdcAmount, 2)} USDC</span>
                </div>
                <span className="num text-xs text-lime">{short(o.sig, 6, 6)} ↗</span>
              </a>
            );
          })}
        </div>
      </div>

      <TxModal tx={v.tx} onClose={v.closeTx} />
    </div>
  );
}

export default function OutcomesPage() {
  return (
    <Suspense fallback={<div className="card h-96 animate-pulse p-7" />}>
      <OutcomesInner />
    </Suspense>
  );
}
