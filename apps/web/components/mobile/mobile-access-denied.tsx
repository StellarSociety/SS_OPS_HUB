"use client";

import { Lock } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";

export function MobileAccessDenied({
  message = "You don’t have access to the mobile app for this venue.",
}: {
  message?: string;
} = {}) {
  const reduceMotion = useReducedMotion();

  return (
    <div className="flex h-full min-h-0 items-center justify-center bg-[#ffffff] px-8 text-center dark:bg-[#000000]">
      <div className="flex max-w-[18rem] flex-col items-center">
        <div className="relative flex h-28 w-28 items-center justify-center" aria-hidden>
          {/* Soft rings pulsing outwards. */}
          {reduceMotion
            ? null
            : [0, 1].map((ring) => (
                <motion.span
                  key={ring}
                  className="absolute inset-0 rounded-full border border-[#E11D48]/30"
                  initial={{ scale: 0.6, opacity: 0 }}
                  animate={{ scale: [0.6, 1.15], opacity: [0.7, 0] }}
                  transition={{
                    duration: 2.4,
                    repeat: Infinity,
                    delay: ring * 1.2,
                    ease: "easeOut",
                  }}
                />
              ))}
          <motion.span
            className="relative flex h-20 w-20 items-center justify-center rounded-full bg-[#E11D48]/10 ring-1 ring-[#E11D48]/20 dark:bg-[#E11D48]/15"
            initial={reduceMotion ? false : { scale: 0.7, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 320, damping: 18 }}
          >
            {/* The lock gives a small "locked" shake every few seconds. */}
            <motion.span
              className="flex"
              animate={
                reduceMotion
                  ? undefined
                  : { rotate: [0, -12, 10, -6, 3, 0] }
              }
              transition={{
                duration: 0.7,
                repeat: Infinity,
                repeatDelay: 2.6,
                delay: 0.6,
                ease: "easeInOut",
              }}
            >
              <Lock className="h-9 w-9 text-[#E11D48]" strokeWidth={1.75} />
            </motion.span>
          </motion.span>
        </div>

        <motion.div
          className="mt-6"
          initial={reduceMotion ? false : { y: 8, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.35, delay: 0.15, ease: "easeOut" }}
        >
          <h1 className="font-serif text-2xl text-[#3D421F] dark:text-white">
            No access
          </h1>
          <p className="mt-2 text-sm leading-snug text-black/60 dark:text-white/60">
            {message}
          </p>
          <p className="mt-4 text-[13px] leading-snug text-black/45 dark:text-white/45">
            Please contact your supervisor or Hub admin for further assistance.
          </p>
        </motion.div>
      </div>
    </div>
  );
}
