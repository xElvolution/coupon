"use client";
// Per digit rolling counter. Each digit is a 0..9 column translated on change.
export default function RollingNumber({ value, className = "" }: { value: string; className?: string }) {
  return (
    <span className={`num inline-flex overflow-hidden leading-none ${className}`} aria-label={value}>
      {value.split("").map((ch, i) =>
        /\d/.test(ch) ? (
          <span key={i} className="relative inline-block h-[1em] w-[0.62em] overflow-hidden" aria-hidden>
            <span className="absolute left-0 top-0 flex flex-col transition-transform duration-[400ms] ease-[cubic-bezier(0.215,0.61,0.355,1)]" style={{ transform: `translateY(-${Number(ch) * 10}%)` }}>
              {Array.from({ length: 10 }, (_, d) => <span key={d} className="block h-[1em] text-center">{d}</span>)}
            </span>
          </span>
        ) : (
          <span key={i} aria-hidden className="inline-block">{ch}</span>
        ),
      )}
    </span>
  );
}
