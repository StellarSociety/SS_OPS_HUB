"use client";

import { motion } from "framer-motion";
import { ModuleTile } from "@/components/modules/module-tile";
import type { ModuleOverviewItem } from "@/lib/modules-registry";

export type ModuleGridItem = ModuleOverviewItem & {
  clickable: boolean;
};

type ModulesGridProps = {
  modules: ModuleGridItem[];
};

export function ModulesGrid({ modules }: ModulesGridProps) {
  return (
    <motion.div
      className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
      initial="hidden"
      animate="visible"
      variants={{
        hidden: {},
        visible: { transition: { staggerChildren: 0.06 } },
      }}
    >
      {modules.map((mod) => (
        <motion.div
          key={mod.key}
          variants={{
            hidden: { opacity: 0, y: 12 },
            visible: {
              opacity: 1,
              y: 0,
              transition: { duration: 0.25, ease: [0.25, 0.1, 0.25, 1] },
            },
          }}
        >
          <ModuleTile
            label={mod.label}
            description={mod.description}
            icon={mod.icon}
            status={mod.status}
            href={mod.href}
            clickable={mod.clickable}
          />
        </motion.div>
      ))}
    </motion.div>
  );
}
