// Client JSON fetch: sends the tunnel bypass header (harmless elsewhere), times out, rejects
// non JSON answers (a tunnel interstitial is HTML), and falls back to the last good value.
const memo = new Map<string, unknown>();
const LS = "coupon:api:";

export async function getJSON<T>(url: string, { timeoutMs = 8000, fallback = true }: { timeoutMs?: number; fallback?: boolean } = {}): Promise<T> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { cache: "no-store", signal: ctl.signal, headers: { "bypass-tunnel-reminder": "1", accept: "application/json" } });
    if (!(r.headers.get("content-type") ?? "").includes("application/json")) throw new Error(`non JSON answer (${r.status})`);
    const j = (await r.json()) as T;
    memo.set(url, j);
    try { localStorage.setItem(LS + url, JSON.stringify(j)); } catch {}
    return j;
  } catch (e) {
    if (fallback) {
      if (memo.has(url)) return memo.get(url) as T;
      try {
        const s = localStorage.getItem(LS + url);
        if (s) return JSON.parse(s) as T;
      } catch {}
    }
    throw e;
  } finally {
    clearTimeout(t);
  }
}
