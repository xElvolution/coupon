"use client";
import Link from "next/link";
import { useRef } from "react";
import gsap from "gsap";

export default function MagneticLink({ href, children, className = "" }: { href: string; children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLAnchorElement>(null);
  return (
    <Link
      ref={ref}
      href={href}
      className={className}
      onMouseMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        gsap.to(e.currentTarget, { x: ((e.clientX - r.left) / r.width - 0.5) * 12, y: ((e.clientY - r.top) / r.height - 0.5) * 12, duration: 0.3, ease: "power2.out" });
      }}
      onMouseLeave={(e) => gsap.to(e.currentTarget, { x: 0, y: 0, duration: 0.8, ease: "elastic.out(1,0.4)" })}
    >
      {children}
    </Link>
  );
}
