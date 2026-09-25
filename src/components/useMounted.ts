"use client";
import { useEffect, useState } from "react";

/** false during server render and hydration, true after mount: keeps clock dependent text out of hydration. */
export function useMounted() {
  const [m, setM] = useState(false);
  useEffect(() => setM(true), []);
  return m;
}
