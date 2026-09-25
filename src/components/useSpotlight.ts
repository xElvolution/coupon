"use client";
import { useCallback } from "react";

/** Cursor spotlight + subtle tilt for .spot cards. */
export function useSpotlight(tilt = 0) {
  return {
    onMouseMove: useCallback((e: React.MouseEvent<HTMLElement>) => {
      const el = e.currentTarget;
      const r = el.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width;
      const py = (e.clientY - r.top) / r.height;
      el.style.setProperty("--mx", `${px * 100}%`);
      el.style.setProperty("--my", `${py * 100}%`);
      if (tilt) el.style.transform = `perspective(900px) rotateY(${(px - 0.5) * tilt}deg) rotateX(${(0.5 - py) * tilt}deg)`;
    }, [tilt]),
    onMouseLeave: useCallback((e: React.MouseEvent<HTMLElement>) => {
      if (tilt) {
        const el = e.currentTarget;
        el.style.transition = "transform .9s cubic-bezier(.34,1.56,.64,1)";
        el.style.transform = "perspective(900px) rotateY(0) rotateX(0)";
        setTimeout(() => { el.style.transition = ""; }, 900);
      }
    }, [tilt]),
  };
}
