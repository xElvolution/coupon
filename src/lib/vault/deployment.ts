import type { Deployment } from "./sdk";
import devnet from "./deployment.devnet.json";

/**
 * Which coupon_vault deployment the app talks to. Defaults to the committed devnet deployment.
 * NEXT_PUBLIC_COUPON_DEPLOYMENT (inline JSON) overrides it, for a local validator or a redeploy.
 */
function load(): Deployment | null {
  const env = process.env.NEXT_PUBLIC_COUPON_DEPLOYMENT;
  if (env) {
    try {
      return JSON.parse(env) as Deployment;
    } catch {
      /* fall through */
    }
  }
  return (devnet as unknown as Deployment | null) ?? null;
}
export const DEPLOYMENT = load();
export const RPC_URL = process.env.NEXT_PUBLIC_SOLANA_RPC || "https://api.devnet.solana.com";
export const CLUSTER_PARAM = DEPLOYMENT?.cluster === "localnet" ? `?cluster=custom&customUrl=${encodeURIComponent(RPC_URL)}` : "?cluster=devnet";
export const explorerTx = (sig: string) => `https://explorer.solana.com/tx/${sig}${CLUSTER_PARAM}`;
export const explorerAddr = (a: string) => `https://explorer.solana.com/address/${a}${CLUSTER_PARAM}`;
