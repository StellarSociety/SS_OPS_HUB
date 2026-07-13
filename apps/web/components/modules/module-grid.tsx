"use client";

import { motion } from "framer-motion";
import { ModuleTile } from "@/components/modules/module-tile";
import type { ModuleGridItem } from "@/components/modules/modules-overview";
import { cn } from "@/lib/utils";

const tileVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.3, ease: [0.25, 0.1, 0.25, 1] as const },
  },
};

const gridVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.05 } },
};

type ModuleGridProps = {
  modules: ModuleGridItem[];
  /** Center the tiles as a group instead of distributing them across a fixed grid. */
  centered?: boolean;
};

export function ModuleGrid({ modules, centered = false }: ModuleGridProps) {
  return (
    <motion.div
      className={cn(
        centered
          ? "flex flex-wrap justify-center gap-x-8 gap-y-5"
          : "grid grid-cols-4 gap-x-1 gap-y-5 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-7 xl:grid-cols-8",
      )}
      initial="hidden"
      animate="visible"
      variants={gridVariants}
    >
      {modules.map((mod) => (
        <motion.div
          key={mod.key}
          variants={tileVariants}
          className={cn(centered && "w-[5.75rem]")}
        >
          <ModuleTile
            label={mod.label}
            iconKey={mod.iconKey}
            status={mod.status}
            href={mod.href}
            clickable={mod.clickable}
            blockedReason={mod.blockedReason}
          />
        </motion.div>
      ))}
    </motion.div>
  );
}
