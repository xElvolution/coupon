// Engraved security pattern generated from hypotrochoid curves, like the rosettes on bond certificates.
function gcd(a: number, b: number): number { return b ? gcd(b, a % b) : a; }
function rosette(c: number, R: number, r: number, d: number, steps = 1100) {
  let p = "";
  const k = (R - r) / r;
  const turns = r / gcd(Math.round(R), Math.round(r));
  const total = Math.PI * 2 * turns;
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * total;
    const x = c + (R - r) * Math.cos(t) + d * Math.cos(k * t);
    const y = c + (R - r) * Math.sin(t) - d * Math.sin(k * t);
    p += `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`;
  }
  return p;
}

export function Rosette({ size = 400, color = "currentColor", opacity = 0.06, rings = 4, className = "", spin = false }: { size?: number; color?: string; opacity?: number; rings?: number; className?: string; spin?: boolean }) {
  const c = 200;
  const paths = Array.from({ length: rings }, (_, i) => {
    const R = 190 - i * 34;
    return rosette(c, R, Math.round(R / (6 + i * 2)), R * (0.24 + i * 0.03));
  });
  return (
    <svg viewBox="0 0 400 400" width={size} height={size} className={`${spin ? "spin-slow" : ""} ${className}`} aria-hidden style={{ opacity }}>
      {paths.map((d, i) => (
        <path key={i} d={d} fill="none" stroke={color} strokeWidth={0.6} />
      ))}
    </svg>
  );
}

export function WaveBand({ className = "", color = "currentColor", lines = 7, opacity = 0.2 }: { className?: string; color?: string; lines?: number; opacity?: number }) {
  const w = 600, h = 40;
  const ps: string[] = [];
  for (let l = 0; l < lines; l++) {
    let d = "";
    for (let x = 0; x <= w; x += 4) {
      const y = h / 2 + Math.sin(x / 14 + l * 0.9) * (h / 2.6) * Math.cos(x / 90 + l * 0.3);
      d += `${x ? "L" : "M"}${x} ${y.toFixed(1)}`;
    }
    ps.push(d);
  }
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className={className} aria-hidden style={{ opacity }}>
      {ps.map((d, i) => <path key={i} d={d} fill="none" stroke={color} strokeWidth={0.6} />)}
    </svg>
  );
}
