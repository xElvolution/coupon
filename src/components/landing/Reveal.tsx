"use client";
import { motion } from "framer-motion";

export default function Reveal({ children, delay = 0, className = "" }: { children: React.ReactNode; delay?: number; className?: string }) {
  return (
    <motion.div initial={{ opacity: 0, y: 40 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "0px 0px -20% 0px" }} transition={{ duration: 0.8, delay, ease: [0.215, 0.61, 0.355, 1] }} className={className}>
      {children}
    </motion.div>
  );
}
