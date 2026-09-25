"use client";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { MarketSnapshot, SnapshotResponse } from "@/lib/types";
import { getJSON } from "@/lib/api";

interface Ctx { data: SnapshotResponse | null; loading: boolean; error: string | null; refresh: () => void; get: (x: string) => MarketSnapshot | undefined }
const MarketsCtx = createContext<Ctx>({ data: null, loading: true, error: null, refresh: () => {}, get: () => undefined });

export function MarketsProvider({ children, initial = null }: { children: React.ReactNode; initial?: SnapshotResponse | null }) {
  const [data, setData] = useState<SnapshotResponse | null>(initial);
  const [loading, setLoading] = useState(!initial);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      const j = await getJSON<SnapshotResponse>("/api/markets");
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
