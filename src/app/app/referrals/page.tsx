"use client";
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { PageHead } from "@/components/app/ui";
import { usd, short } from "@/lib/format";
import { explorerTx } from "@/lib/vault/deployment";

const DEMO_SIG = "49rSbVS6v61Cq16cbGqE4TFErYGVHvitpHNAV3iPH8ogiLdKcWN68mBmTpHqQMdq25zeRSkoKG9HztWv7v6YhfTv";

const TIERS = [
  {
    name: "Bronze",
    volReq: "$0+ Monthly Vol",
    rebatePct: 15,
    discountPct: 5,
    pointsMult: "1.0x",
    perks: ["15% of all pool, prediction & perp fees", "5% fee discount for invited friends", "Instant USDC claim on Solana"],
    active: false,
  },
  {
    name: "Silver · Active",
    volReq: "$100k+ Monthly Vol",
    rebatePct: 25,
    discountPct: 10,
    pointsMult: "1.5x",
    perks: ["25% of all pool, prediction & perp fees", "10% fee discount for invited friends", "1.5x Season 1 Dividend Points boost"],
    active: true,
  },
  {
    name: "Gold Partner",
    volReq: "$500k+ Monthly Vol",
    rebatePct: 35,
    discountPct: 15,
    pointsMult: "2.5x",
    perks: ["35% of all pool, prediction & perp fees", "Custom vanity referral code & landing card", "2.5x Season 1 Points + co-marketing"],
    active: false,
  },
];

const LEADERBOARD = [
  { rank: 1, handle: "SolanaYieldWhale", code: "YIELD1", traders: 184, volumeUsd: 1420000, earnedUsd: 4970.0, points: "142,000" },
  { rank: 2, handle: "xStocksAlpha", code: "XSTOCK", traders: 129, volumeUsd: 980400, earnedUsd: 3431.4, points: "98,040" },
  { rank: 3, handle: "MacroStripDesk", code: "STRIP", traders: 94, volumeUsd: 715200, earnedUsd: 1788.0, points: "71,520" },
  { rank: 4, handle: "DeFiFixedIncome", code: "COUPON", traders: 68, volumeUsd: 482900, earnedUsd: 1207.25, points: "48,290" },
  { rank: 5, handle: "PerpSpreadPro", code: "SPREAD", traders: 51, volumeUsd: 319000, earnedUsd: 797.5, points: "31,900" },
];

export default function ReferralsPage() {
  const [code, setCode] = useState("COUPON-VIP");
  const [copied, setCopied] = useState(false);
  const [claimed, setClaimed] = useState(false);
  const [showClaimModal, setShowClaimModal] = useState(false);
  const [calcVolume, setCalcVolume] = useState(250000);

  const shareUrl = `https://coupon-sigma-six.vercel.app/?ref=${code}`;
  const claimableAmount = claimed ? 0 : 342.8;

  const handleCopy = () => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(shareUrl).catch(() => {});
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2200);
  };

  const handleShareX = () => {
    const text = encodeURIComponent(
      `Trading tokenized stock dividends, prediction outcomes, and 20x xStock perpetuals on COUPON.\n\nGet 10% off trading fees with my invite link: ${shareUrl}`
    );
    window.open(`https://x.com/intent/tweet?text=${text}`, "_blank", "noopener,noreferrer");
  };

  const estMonthlyFees = calcVolume * 0.0015;
  const estSilverRebate = estMonthlyFees * 0.25;
  const estGoldRebate = estMonthlyFees * 0.35;

  return (
    <div className="space-y-6 sm:space-y-8">
      <PageHead
        kicker="Referrals & Growth"
        title="Invite traders,"
        accent="earn 25% in USDC."
        sub="Share COUPON across dividend pools, prediction markets, and xStock perpetuals. You earn up to 35% of every trading fee in USDC while your friends get a 10% fee discount."
      />

      {/* Hero Referral Link & Share Card */}
      <div className="card relative overflow-hidden border-line-2 p-6 sm:p-8">
        <div
          className="pointer-events-none absolute inset-0 opacity-45"
          style={{
            background:
              "radial-gradient(600px circle at 92% 15%, rgba(200,245,96,0.22), transparent 65%), radial-gradient(450px circle at 10% 90%, rgba(56,189,248,0.12), transparent 60%)",
          }}
        />

        <div className="relative z-10 grid grid-cols-1 gap-6 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-lime/35 bg-lime/10 px-3 py-1 text-xs font-semibold text-lime">
              <span className="live-dot h-1.5 w-1.5 rounded-full bg-lime" />
              Season 1 Referral Program · Silver Tier Active (25% Rebate)
            </div>
            <h2 className="display mt-4 text-3xl leading-tight text-ink sm:text-4xl">
              Your personal invite link is live.
            </h2>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-dim">
              Every time a trader connects through your link and splits an xStock, buys Yes/No prediction shares, or trades a perpetual contract, 25% of the protocol fee routes directly to your claimable USDC vault.
            </p>

            {/* Referral Link Box */}
            <div className="mt-6 flex flex-col gap-2.5 sm:flex-row sm:items-center">
              <div className="flex flex-1 items-center justify-between gap-2 rounded-2xl border border-line-2 bg-bg/90 px-4 py-3">
                <span className="micro shrink-0 !text-[9px] text-dim">Invite URL</span>
                <span className="num truncate text-sm font-medium text-lime">{shareUrl}</span>
              </div>
              <button
                type="button"
                onClick={handleCopy}
                className="btn btn-lime h-12 shrink-0 px-6 text-xs font-semibold"
              >
                {copied ? "✓ Link Copied!" : "Copy Invite Link"}
              </button>
              <button
                type="button"
                onClick={handleShareX}
                className="btn btn-line h-12 shrink-0 px-5 text-xs font-semibold"
              >
                Share on X ↗
              </button>
            </div>

            {/* Custom Code Editor */}
            <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-dim">
              <span>Custom referral code:</span>
              <input
                type="text"
                value={code}
                onChange={(e) =>
                  setCode(
                    e.target.value
                      .toUpperCase()
                      .replace(/[^A-Z0-9-]/g, "")
                      .slice(0, 14) || "COUPON"
                  )
                }
                className="num h-8 w-36 rounded-lg border border-line-2 bg-bg px-2.5 text-xs font-semibold text-ink outline-none focus:border-lime"
              />
              <span className="text-faint">Friends automatically receive a 10% fee rebate</span>
            </div>
          </div>

          {/* Right Claimable Rebate Vault Card */}
          <div className="rounded-2xl border border-lime/30 bg-bg/85 p-5 backdrop-blur-md">
            <div className="flex items-center justify-between">
              <span className="micro !text-[9px] text-lime">Claimable Fee Rebates</span>
              <span className="rounded-full border border-line-2 bg-surface px-2.5 py-0.5 text-[10px] text-dim">
                Solana Devnet
              </span>
            </div>
            <div className="num mt-3 text-4xl font-bold text-ink">{usd(claimableAmount)}</div>
            <div className="mt-1 text-xs text-dim">
              {claimed
                ? "All accrued rebates claimed to your wallet"
                : "Accrued from 18 referred traders ($137,120 volume)"}
            </div>

            <div className="mt-5 grid grid-cols-2 gap-2.5 border-t border-line pt-4 text-xs">
              <div>
                <div className="text-faint">Lifetime Earned</div>
                <div className="num mt-0.5 font-semibold text-ink">$1,284.50 USDC</div>
              </div>
              <div>
                <div className="text-faint">Season 1 Points</div>
                <div className="num mt-0.5 font-semibold text-lime">18,450 PTS</div>
              </div>
            </div>

            <button
              type="button"
              disabled={claimed}
              onClick={() => {
                setClaimed(true);
                setShowClaimModal(true);
              }}
              className="btn btn-lime mt-5 h-11 w-full text-xs font-semibold"
            >
              {claimed ? "✓ Rebates Claimed" : `Claim ${usd(claimableAmount)} USDC Now`}
            </button>
          </div>
        </div>
      </div>

      {/* 4 Summary Metrics */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          ["Referred Traders", "18 active", "+4 this week"],
          ["Referred Volume", "$137,120", "Across Coupons, Predictions & Perps"],
          ["Your Rebate Tier", "25% Silver", "$362.8k to Gold Partner (35%)"],
          ["Points Multiplier", "1.5x Boost", "18,450 Season 1 Points"],
        ].map(([k, v, sub], i) => (
          <div key={k} className="card border-line-2 p-5">
            <div className="micro !text-[9px] text-dim">{k}</div>
            <div className={`num mt-2 text-2xl font-semibold ${i === 2 ? "text-lime" : "text-ink"}`}>
              {v}
            </div>
            <div className="mt-1 text-xs text-faint">{sub}</div>
          </div>
        ))}
      </div>

      {/* Tier Progression & Interactive Earnings Calculator */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.35fr_0.65fr]">
        {/* 3 Tier Cards */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {TIERS.map((t) => (
            <div
              key={t.name}
              className={`card flex flex-col justify-between p-5 ${
                t.active ? "border-lime/50 bg-lime/[0.04]" : "border-line-2"
              }`}
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className="micro !text-[9px] text-lime">{t.volReq}</span>
                  {t.active && (
                    <span className="rounded-full bg-lime px-2 py-0.5 text-[9px] font-bold uppercase text-bg">
                      Current
                    </span>
                  )}
                </div>
                <div className="display mt-2 text-2xl text-ink">{t.name}</div>
                <div className="num mt-3 text-4xl font-bold text-lime">{t.rebatePct}%</div>
                <div className="text-xs text-dim">Commission on protocol fees</div>

                <ul className="mt-5 space-y-2 border-t border-line pt-4 text-xs text-dim">
                  {t.perks.map((p) => (
                    <li key={p} className="flex items-start gap-2">
                      <span className="text-lime">✓</span>
                      <span>{p}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="mt-5 rounded-xl border border-line bg-bg/60 px-3 py-2 text-center text-xs">
                Points Boost: <strong className="num text-lime">{t.pointsMult}</strong> · Friend Discount:{" "}
                <strong className="num text-ink">{t.discountPct}%</strong>
              </div>
            </div>
          ))}
        </div>

        {/* Interactive Rebate Estimator */}
        <div className="card flex flex-col justify-between border-line-2 p-6">
          <div>
            <div className="micro !text-[9px] text-lime">Earnings Simulator</div>
            <h3 className="display mt-2 text-2xl text-ink">Estimate monthly USDC rebates</h3>
            <p className="mt-1 text-xs text-dim">
              Slide to model your monthly referred volume across Prediction Markets and Perpetuals.
            </p>

            <div className="mt-5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-dim">Monthly Referred Volume</span>
                <span className="num text-base font-bold text-lime">{usd(calcVolume, 0)}</span>
              </div>
              <div className="mt-3">
                <input
                  type="range"
                  min={25000}
                  max={2000000}
                  step={25000}
                  value={calcVolume}
                  onChange={(e) => setCalcVolume(Number(e.target.value))}
                  style={
                    {
                      "--fill": `${((calcVolume - 25000) / (2000000 - 25000)) * 100}%`,
                    } as React.CSSProperties
                  }
                />
              </div>
            </div>
          </div>

          <div className="mt-5 space-y-2.5 rounded-2xl border border-line bg-bg/60 p-4 text-xs">
            <div className="flex justify-between">
              <span className="text-dim">Silver Tier Rebate (25%)</span>
              <span className="num font-semibold text-ink">{usd(estSilverRebate)} / mo</span>
            </div>
            <div className="flex justify-between">
              <span className="text-dim">Gold Partner Rebate (35%)</span>
              <span className="num text-base font-bold text-lime">{usd(estGoldRebate)} / mo</span>
            </div>
            <div className="flex justify-between border-t border-line pt-2">
              <span className="text-dim">Annualized Partner Income</span>
              <span className="num font-semibold text-lime">{usd(estGoldRebate * 12, 0)} / yr</span>
            </div>
          </div>
        </div>
      </div>

      {/* Top Referrers Leaderboard */}
      <div className="card overflow-hidden border-line-2">
        <div className="flex items-center justify-between border-b border-line px-6 py-4">
          <div>
            <div className="display text-2xl text-ink">Top Referrers Leaderboard</div>
            <p className="text-xs text-dim">Season 1 ambassadors ranked by referred trading volume</p>
          </div>
          <span className="micro !text-[9px] text-lime">Updated Live</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-line bg-surface-2/40 text-[10px] uppercase tracking-wider text-faint">
                <th className="px-6 py-3">Rank</th>
                <th className="px-6 py-3">Ambassador</th>
                <th className="px-6 py-3">Code</th>
                <th className="px-6 py-3">Traders</th>
                <th className="px-6 py-3">Referred Volume</th>
                <th className="px-6 py-3">USDC Earned</th>
                <th className="px-6 py-3 text-right">Season Points</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {LEADERBOARD.map((row) => (
                <tr key={row.rank} className="hover:bg-surface-2/40">
                  <td className="num px-6 py-3.5 font-bold text-lime">#{row.rank}</td>
                  <td className="px-6 py-3.5 font-medium text-ink">{row.handle}</td>
                  <td className="num px-6 py-3.5">
                    <span className="rounded-full border border-line-2 bg-bg px-2.5 py-0.5 text-[11px] text-dim">
                      {row.code}
                    </span>
                  </td>
                  <td className="num px-6 py-3.5 text-ink">{row.traders}</td>
                  <td className="num px-6 py-3.5 font-medium text-ink">{usd(row.volumeUsd, 0)}</td>
                  <td className="num px-6 py-3.5 font-semibold text-lime">{usd(row.earnedUsd)}</td>
                  <td className="num px-6 py-3.5 text-right text-share">{row.points} PTS</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Claim Modal */}
      <AnimatePresence>
        {showClaimModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[80] flex items-center justify-center bg-bg/75 p-4 backdrop-blur-md"
            onClick={() => setShowClaimModal(false)}
          >
            <motion.div
              initial={{ scale: 0.94, y: 18, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.96, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md rounded-[22px] border border-line-2 bg-surface p-6 shadow-2xl"
            >
              <div className="flex items-center justify-between">
                <span className="micro text-lime">Referral Rebate Claimed</span>
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-lime text-bg font-bold">
                  ✓
                </span>
              </div>
              <div className="display mt-3 text-3xl text-ink">$342.80 USDC Sent</div>
              <p className="mt-1 text-xs text-dim">
                Your 25% Silver Tier fee rebate has been transferred on Solana devnet.
              </p>

              <a
                href={explorerTx(DEMO_SIG)}
                target="_blank"
                rel="noreferrer"
                className="num mt-5 flex items-center justify-between rounded-xl border border-line-2 bg-bg px-4 py-2.5 text-xs text-lime hover:underline"
              >
                <span>{short(DEMO_SIG, 10, 10)}</span>
                <span>View on Solana Explorer ↗</span>
              </a>

              <button
                type="button"
                onClick={() => setShowClaimModal(false)}
                className="btn btn-lime mt-4 h-11 w-full text-sm"
              >
                Done
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
