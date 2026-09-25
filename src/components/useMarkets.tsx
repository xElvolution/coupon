"use client";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { MarketSnapshot, SnapshotResponse } from "@/lib/types";

interface Ctx { data: SnapshotResponse | null; loading: boolean; error: string | null; refresh: () => void; get: (x: string) => MarketSnapshot | undefined }
const MarketsCtx = createContext<Ctx>({ data: null, loading: true, error: null, refresh: () => {}, get: () => undefined });

export function MarketsProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<SnapshotResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/markets", { cache: "no-store" });
      const j = (await r.json()) as SnapshotResponse;
      setData(j);
      setError(j.errors.length ? j.errors.join("; ") : null);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    load();
    const t = setInterval(load, 15_000);
    return () => clearInterval(t);
  }, [load]);
  const get = useCallback((x: string) => data?.markets.find((m) => m.x === x), [data]);
  return <MarketsCtx.Provider value={{ data, loading, error, refresh: load, get }}>{children}</MarketsCtx.Provider>;
}

export const useMarkets = () => useContext(MarketsCtx);
