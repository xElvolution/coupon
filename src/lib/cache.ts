import "server-only";
import { buildSnapshot } from "./server-data";
import type { SnapshotResponse } from "./types";

let last: { at: number; data: SnapshotResponse } | null = null;
let inflight: Promise<SnapshotResponse> | null = null;

export async function getSnapshot(maxAgeMs = 20_000): Promise<SnapshotResponse> {
  if (last && Date.now() - last.at < maxAgeMs) return last.data;
  if (!inflight) {
    inflight = buildSnapshot()
      .then((d) => {
        // keep the last good chain read if a refresh partially fails
        if (last && d.errors.length) {
          d.markets = d.markets.map((m, i) => ({
            ...m,
            multiplier: m.multiplier ?? last!.data.markets[i].multiplier,
            equity: m.equity ?? last!.data.markets[i].equity,
            xPrice: m.xPrice ?? last!.data.markets[i].xPrice,
          }));
        }
        last = { at: Date.now(), data: d };
        return d;
      })
      .finally(() => { inflight = null; });
  }
  return inflight;
}
