"use client";

import { motion } from "framer-motion";

export function PageTransition({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 1, ease: [0.32, 0.72, 0, 1] }}
    >
      {children}
    </motion.div>
    // <>{children}</>
  );
}
