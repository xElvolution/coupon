import Link from "next/link";

export function Mark({ size = 26, tick = false }: { size?: number; tick?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden className={tick ? "tick" : ""}>
      <path d="M4 7h24a2 2 0 0 1 2 2v4a3 3 0 0 0 0 6v4a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-4a3 3 0 0 0 0-6V9a2 2 0 0 1 2-2z" fill="#c8f560" />
      <path d="M21 9v14" stroke="#0a0b0d" strokeWidth="1.8" strokeDasharray="1.6 2.2" strokeLinecap="round" />
      <path d="M14.5 12.6a4 4 0 1 0 0 6.8" stroke="#0a0b0d" strokeWidth="2.4" fill="none" strokeLinecap="round" />
    </svg>
  );
}

export default function Logo({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="group flex items-center gap-2.5" aria-label="COUPON home">
      <Mark tick />
      <span className="display text-[23px] leading-none">Coupon</span>
    </Link>
  );
}
